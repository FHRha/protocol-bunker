using System.Globalization;
using System.Text.Json;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopLocalizationService : ILocalizationService
{
    private IReadOnlyDictionary<string, string> _dictionary;

    public DesktopLocalizationService(string? preferredLanguage = null)
    {
        CurrentLanguage = ResolveLanguage(preferredLanguage);
        _dictionary = LoadDictionary(CurrentLanguage);
    }

    public string CurrentLanguage { get; private set; }

    public IReadOnlyList<string> AvailableLanguages { get; } = ["auto", "ru", "en"];

    public event EventHandler? LanguageChanged;

    public string Get(string key)
    {
        if (_dictionary.TryGetValue(key, out var value))
        {
            return value;
        }

        return key;
    }

    public void SetLanguage(string language)
    {
        var resolved = ResolveLanguage(language);
        if (string.Equals(CurrentLanguage, resolved, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        CurrentLanguage = resolved;
        _dictionary = LoadDictionary(CurrentLanguage);
        LanguageChanged?.Invoke(this, EventArgs.Empty);
    }

    private static string ResolveLanguage(string? preferredLanguage = null)
    {
        var preferred = (preferredLanguage ?? string.Empty).Trim().ToLowerInvariant();
        if (preferred is "ru" or "en")
        {
            return preferred;
        }

        var lang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        return string.Equals(lang, "ru", StringComparison.OrdinalIgnoreCase) ? "ru" : "en";
    }

    private static IReadOnlyDictionary<string, string> LoadDictionary(string language)
    {
        var baseDir = AppContext.BaseDirectory;
        var path = Path.Combine(baseDir, "Localization", $"desktop.{language}.json");
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Desktop localization file not found: {path}");
        }

        using var stream = File.OpenRead(path);
        var data = JsonSerializer.Deserialize<Dictionary<string, string>>(stream);
        if (data is null)
        {
            throw new InvalidOperationException($"Failed to load desktop localization dictionary: {path}");
        }

        return data;
    }
}
