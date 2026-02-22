using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Drawing;
using System.Windows.Forms;

namespace ProtocolBunker.Bootstrapper;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        SetupProgressForm? progress = null;
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            progress = new SetupProgressForm();
            progress.Show();
            Application.DoEvents();

            InstallAsync(progress.SetStatus).GetAwaiter().GetResult();
            progress.SetStatus("Done. Starting launcher...");
            Application.DoEvents();
            return 0;
        }
        catch (Exception ex)
        {
            try
            {
                progress?.Close();
            }
            catch
            {
                // ignore
            }
            MessageBox.Show(
                ex.Message,
                "Protocol: Bunker Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            try
            {
                progress?.Close();
                progress?.Dispose();
            }
            catch
            {
                // ignore
            }
        }
    }

    private static Task InstallAsync(Action<string>? reportStatus = null)
    {
        reportStatus?.Invoke("Preparing setup...");
        Application.DoEvents();

        var setupPath = Environment.ProcessPath
            ?? Process.GetCurrentProcess().MainModule?.FileName
            ?? throw new InvalidOperationException("Cannot resolve setup executable path.");

        var installDir = Path.GetDirectoryName(setupPath)
            ?? throw new InvalidOperationException("Cannot resolve install directory.");

        var tempRoot = Path.Combine(Path.GetTempPath(), "ProtocolBunkerSetup", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        var payloadZipPath = Path.Combine(tempRoot, "payload.zip");
        var extractDir = Path.Combine(tempRoot, "extract");

        try
        {
            reportStatus?.Invoke("Preparing embedded package...");
            Application.DoEvents();
            var extractedEmbedded = TryExtractEmbeddedPayload(payloadZipPath);
            if (!extractedEmbedded)
            {
                throw new InvalidOperationException("Embedded package not found in setup executable.");
            }

            reportStatus?.Invoke("Extracting files...");
            Application.DoEvents();
            ZipFile.ExtractToDirectory(payloadZipPath, extractDir, overwriteFiles: true);
            var sourceRoot = ResolvePayloadRoot(extractDir);

            reportStatus?.Invoke("Copying files...");
            Application.DoEvents();
            CopyDirectory(sourceRoot, installDir);

            var launcherPath = Path.Combine(installDir, "ProtocolBunker.exe");
            if (!File.Exists(launcherPath))
            {
                throw new FileNotFoundException("ProtocolBunker.exe not found after installation.", launcherPath);
            }

            reportStatus?.Invoke("Starting launcher...");
            Application.DoEvents();
            Process.Start(new ProcessStartInfo
            {
                FileName = launcherPath,
                WorkingDirectory = installDir,
                UseShellExecute = true,
            });

            ScheduleSelfDelete(setupPath);
        }
        finally
        {
            TryDeleteDirectory(tempRoot);
        }

        return Task.CompletedTask;
    }

    private static bool TryExtractEmbeddedPayload(string destinationPath)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            var resourceName = asm
                .GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase));

            if (resourceName is null)
            {
                return false;
            }

            using var stream = asm.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                return false;
            }

            using var output = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
            stream.CopyTo(output);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string ResolvePayloadRoot(string extractedRoot)
    {
        var directLauncher = Path.Combine(extractedRoot, "ProtocolBunker.exe");
        if (File.Exists(directLauncher))
        {
            return extractedRoot;
        }

        var nestedRoot = Directory
            .EnumerateDirectories(extractedRoot)
            .FirstOrDefault(dir => File.Exists(Path.Combine(dir, "ProtocolBunker.exe")));

        if (nestedRoot is null)
        {
            throw new InvalidOperationException("Invalid payload archive format.");
        }

        return nestedRoot;
    }

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        Directory.CreateDirectory(destinationDir);

        foreach (var directory in Directory.EnumerateDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, directory);
            Directory.CreateDirectory(Path.Combine(destinationDir, relative));
        }

        foreach (var sourceFile in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, sourceFile);
            var destinationFile = Path.Combine(destinationDir, relative);
            var parent = Path.GetDirectoryName(destinationFile);
            if (!string.IsNullOrWhiteSpace(parent))
            {
                Directory.CreateDirectory(parent);
            }

            File.Copy(sourceFile, destinationFile, overwrite: true);
        }
    }

    private static void ScheduleSelfDelete(string setupPath)
    {
        var escapedPath = setupPath.Replace("'", "''");
        var psScript =
            $"$target='{escapedPath}'; " +
            "for($i=0; $i -lt 120; $i++) { " +
            "try { Remove-Item -LiteralPath $target -Force -ErrorAction Stop; break } " +
            "catch { Start-Sleep -Milliseconds 500 } }";
        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command \"{psScript}\"",
            CreateNoWindow = true,
            UseShellExecute = false,
        });
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // ignore cleanup errors
        }
    }

    private sealed class SetupProgressForm : Form
    {
        private readonly Label _statusLabel;

        public SetupProgressForm()
        {
            Text = "Protocol: Bunker Setup";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ControlBox = false;
            ShowIcon = false;
            Width = 520;
            Height = 160;

            var titleLabel = new Label
            {
                Left = 18,
                Top = 16,
                Width = 470,
                Height = 24,
                Font = new Font(SystemFonts.MessageBoxFont!, FontStyle.Bold),
                Text = "Installing Protocol: Bunker"
            };
            Controls.Add(titleLabel);

            _statusLabel = new Label
            {
                Left = 18,
                Top = 48,
                Width = 470,
                Height = 24,
                Text = "Preparing..."
            };
            Controls.Add(_statusLabel);

            var progress = new ProgressBar
            {
                Left = 18,
                Top = 82,
                Width = 470,
                Height = 20,
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 28
            };
            Controls.Add(progress);
        }

        public void SetStatus(string text)
        {
            if (IsDisposed) return;
            _statusLabel.Text = text;
            _statusLabel.Refresh();
            Refresh();
        }
    }
}


