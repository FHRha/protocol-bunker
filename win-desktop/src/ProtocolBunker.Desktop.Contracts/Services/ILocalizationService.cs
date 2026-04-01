namespace ProtocolBunker.Desktop.Contracts.Services;

public interface ILocalizationService
{
    string CurrentLanguage { get; }

    IReadOnlyList<string> AvailableLanguages { get; }

    event EventHandler? LanguageChanged;

    string Get(string key);

    void SetLanguage(string language);
}
