using System.Windows;
using System.Windows.Media;
using Microsoft.Win32;
using Color = System.Windows.Media.Color;
using Brush = System.Windows.Media.Brush;
using ColorConverter = System.Windows.Media.ColorConverter;

namespace ProtocolBunker.Launcher;

internal static class ThemeManager
{
    public const string SystemThemeName = "System";
    public const string LightThemeName = "Light";
    public const string DarkThemeName = "Dark";

    private static readonly ThemePalette LightPalette = new()
    {
        WindowBackground = ColorFromHex("F5F7FA"),
        PanelBackground = Colors.White,
        GroupBackground = Colors.White,
        BorderColor = ColorFromHex("D0D7E2"),
        TextColor = ColorFromHex("1E2430"),
        MutedTextColor = ColorFromHex("5A667A"),
        InputBackground = Colors.White,
        InputTextColor = ColorFromHex("1E2430"),
        InputBorderColor = ColorFromHex("C9D3E1"),
        PrimaryButtonBackground = ColorFromHex("0B6EF6"),
        PrimaryButtonForeground = Colors.White,
        SecondaryButtonBackground = ColorFromHex("E8EDF5"),
        SecondaryButtonForeground = ColorFromHex("1E2430"),
        DangerButtonBackground = ColorFromHex("D94848"),
        DangerButtonForeground = Colors.White,
        LogBackground = ColorFromHex("F9FBFF"),
        LogInfoColor = ColorFromHex("1F2937"),
        LogWarnColor = ColorFromHex("A05A00"),
        LogErrorColor = ColorFromHex("B91C1C"),
    };

    private static readonly ThemePalette DarkPalette = new()
    {
        WindowBackground = ColorFromHex("161B22"),
        PanelBackground = ColorFromHex("0D1117"),
        GroupBackground = ColorFromHex("111827"),
        BorderColor = ColorFromHex("2D3748"),
        TextColor = ColorFromHex("E5E7EB"),
        MutedTextColor = ColorFromHex("9CA3AF"),
        InputBackground = ColorFromHex("1F2937"),
        InputTextColor = ColorFromHex("E5E7EB"),
        InputBorderColor = ColorFromHex("374151"),
        PrimaryButtonBackground = ColorFromHex("2563EB"),
        PrimaryButtonForeground = Colors.White,
        SecondaryButtonBackground = ColorFromHex("374151"),
        SecondaryButtonForeground = ColorFromHex("E5E7EB"),
        DangerButtonBackground = ColorFromHex("B91C1C"),
        DangerButtonForeground = Colors.White,
        LogBackground = ColorFromHex("0B1220"),
        LogInfoColor = ColorFromHex("D1D5DB"),
        LogWarnColor = ColorFromHex("F59E0B"),
        LogErrorColor = ColorFromHex("F87171"),
    };

    public static ThemePalette ApplyTheme(Window window, string themeName)
    {
        var palette = ResolvePalette(themeName);
        var resources = window.Resources;

        SetBrush(resources, "Launcher.WindowBackgroundBrush", palette.WindowBackground);
        SetBrush(resources, "Launcher.PanelBackgroundBrush", palette.PanelBackground);
        SetBrush(resources, "Launcher.GroupBackgroundBrush", palette.GroupBackground);
        SetBrush(resources, "Launcher.BorderBrush", palette.BorderColor);
        SetBrush(resources, "Launcher.TextBrush", palette.TextColor);
        SetBrush(resources, "Launcher.MutedTextBrush", palette.MutedTextColor);

        SetBrush(resources, "Launcher.InputBackgroundBrush", palette.InputBackground);
        SetBrush(resources, "Launcher.InputBorderBrush", palette.InputBorderColor);
        SetBrush(resources, "Launcher.InputTextBrush", palette.InputTextColor);

        SetBrush(resources, "Launcher.PrimaryButtonBackgroundBrush", palette.PrimaryButtonBackground);
        SetBrush(resources, "Launcher.PrimaryButtonForegroundBrush", palette.PrimaryButtonForeground);
        SetBrush(resources, "Launcher.SecondaryButtonBackgroundBrush", palette.SecondaryButtonBackground);
        SetBrush(resources, "Launcher.SecondaryButtonForegroundBrush", palette.SecondaryButtonForeground);
        SetBrush(resources, "Launcher.DangerButtonBackgroundBrush", palette.DangerButtonBackground);
        SetBrush(resources, "Launcher.DangerButtonForegroundBrush", palette.DangerButtonForeground);

        SetBrush(resources, "Launcher.LogBackgroundBrush", palette.LogBackground);
        SetBrush(resources, "Launcher.LogInfoBrush", palette.LogInfoColor);
        SetBrush(resources, "Launcher.LogWarnBrush", palette.LogWarnColor);
        SetBrush(resources, "Launcher.LogErrorBrush", palette.LogErrorColor);

        window.Background = (Brush)resources["Launcher.WindowBackgroundBrush"];
        window.Foreground = (Brush)resources["Launcher.TextBrush"];
        return palette;
    }

    private static void SetBrush(ResourceDictionary resources, string key, Color color)
    {
        resources[key] = new SolidColorBrush(color);
    }

    public static ThemePalette ResolvePalette(string themeName)
    {
        var normalized = (themeName ?? string.Empty).Trim();
        if (normalized.Equals(DarkThemeName, StringComparison.OrdinalIgnoreCase))
        {
            return DarkPalette;
        }

        if (normalized.Equals(LightThemeName, StringComparison.OrdinalIgnoreCase))
        {
            return LightPalette;
        }

        return IsSystemDarkTheme() ? DarkPalette : LightPalette;
    }

    public static Color ColorFromHex(string hex)
    {
        return (Color)ColorConverter.ConvertFromString($"#{hex}");
    }

    private static bool IsSystemDarkTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            var value = key?.GetValue("AppsUseLightTheme");
            if (value is int mode)
            {
                return mode == 0;
            }
        }
        catch
        {
            // fallback to light
        }

        return false;
    }
}

internal sealed class ThemePalette
{
    public Color WindowBackground { get; init; }
    public Color PanelBackground { get; init; }
    public Color GroupBackground { get; init; }
    public Color BorderColor { get; init; }
    public Color TextColor { get; init; }
    public Color MutedTextColor { get; init; }
    public Color InputBackground { get; init; }
    public Color InputTextColor { get; init; }
    public Color InputBorderColor { get; init; }
    public Color PrimaryButtonBackground { get; init; }
    public Color PrimaryButtonForeground { get; init; }
    public Color SecondaryButtonBackground { get; init; }
    public Color SecondaryButtonForeground { get; init; }
    public Color DangerButtonBackground { get; init; }
    public Color DangerButtonForeground { get; init; }
    public Color LogBackground { get; init; }
    public Color LogInfoColor { get; init; }
    public Color LogWarnColor { get; init; }
    public Color LogErrorColor { get; init; }
}
