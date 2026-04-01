using System.Text.Json;
using System.Security.Cryptography;
using Avalonia.Threading;
using ProtocolBunker.Desktop.Application.ViewModels;

namespace ProtocolBunker.Desktop.App.Services;

internal sealed class AsciiAnimationController : IDisposable
{
    private readonly HomeSectionViewModel _home;
    private readonly DispatcherTimer _timer;
    private IReadOnlyList<string> _frames = Array.Empty<string>();
    private int _frameIndex;

    public AsciiAnimationController(HomeSectionViewModel home)
    {
        _home = home;
        _timer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(90),
        };
        _timer.Tick += OnTick;
    }

    public void Start()
    {
        var frames = LoadRandomAnimationFrames();
        if (frames.Count == 0)
        {
            _home.AsciiFrame = string.Empty;
            return;
        }

        _frames = frames;
        _frameIndex = 0;
        _home.AsciiFrame = _frames[0];

        if (_frames.Count > 1)
        {
            _timer.Start();
        }
    }

    public void Dispose()
    {
        _timer.Stop();
        _timer.Tick -= OnTick;
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (_frames.Count == 0)
        {
            return;
        }

        _frameIndex = (_frameIndex + 1) % _frames.Count;
        _home.AsciiFrame = _frames[_frameIndex];
    }

    private static IReadOnlyList<string> LoadRandomAnimationFrames()
    {
        try
        {
            var root = Path.Combine(AppContext.BaseDirectory, "AsciiAnimations");
            if (!Directory.Exists(root))
            {
                return Array.Empty<string>();
            }

            var files = Directory.GetFiles(root, "*.json", SearchOption.TopDirectoryOnly);
            if (files.Length == 0)
            {
                return Array.Empty<string>();
            }

            var selected = files[RandomNumberGenerator.GetInt32(files.Length)];
            var json = File.ReadAllText(selected);
            var rawFrames = JsonSerializer.Deserialize<List<List<string>>>(json);
            if (rawFrames is null || rawFrames.Count == 0)
            {
                return Array.Empty<string>();
            }

            var maxWidth = rawFrames
                .SelectMany(static frame => frame)
                .DefaultIfEmpty(string.Empty)
                .Max(static line => line.Length);

            var maxHeight = rawFrames.Max(static frame => frame.Count);

            return rawFrames
                .Select(frame => NormalizeFrame(frame, maxWidth, maxHeight))
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string NormalizeFrame(IReadOnlyList<string> frame, int maxWidth, int maxHeight)
    {
        var lines = new string[maxHeight];
        for (var i = 0; i < maxHeight; i++)
        {
            var line = i < frame.Count ? frame[i] ?? string.Empty : string.Empty;
            lines[i] = line.PadRight(maxWidth);
        }

        return string.Join(Environment.NewLine, lines);
    }
}
