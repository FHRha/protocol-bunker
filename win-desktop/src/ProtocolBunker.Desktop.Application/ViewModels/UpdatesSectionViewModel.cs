using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class UpdatesSectionViewModel : ViewModelBase
{
    private string _currentVersion;
    private string _latestVersion;
    private string _selectedAssetName;
    private string _statusMessage;
    private string _availabilityText;
    private bool _isUpdateAvailable;
    private bool _canOpenSelectedAsset;

    public UpdatesSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand checkForUpdatesCommand,
        ICommand openReleasesPageCommand,
        ICommand openSelectedAssetCommand)
    {
        T = textCatalog;
        _currentVersion = textCatalog.PlaceholderNotAvailable;
        _latestVersion = textCatalog.PlaceholderNotAvailable;
        _selectedAssetName = textCatalog.PlaceholderNotAvailable;
        _statusMessage = textCatalog.PlaceholderNotAvailable;
        _availabilityText = textCatalog.PlaceholderNotAvailable;
        CheckForUpdatesCommand = checkForUpdatesCommand;
        OpenReleasesPageCommand = openReleasesPageCommand;
        OpenSelectedAssetCommand = openSelectedAssetCommand;
    }

    public DesktopTextCatalog T { get; }

    public ICommand CheckForUpdatesCommand { get; }

    public ICommand OpenReleasesPageCommand { get; }

    public ICommand OpenSelectedAssetCommand { get; }

    public string CurrentVersion
    {
        get => _currentVersion;
        set => SetProperty(ref _currentVersion, value);
    }

    public string LatestVersion
    {
        get => _latestVersion;
        set => SetProperty(ref _latestVersion, value);
    }

    public string SelectedAssetName
    {
        get => _selectedAssetName;
        set => SetProperty(ref _selectedAssetName, value);
    }

    public string SelectedAssetUrl { get; set; } = string.Empty;

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public string AvailabilityText
    {
        get => _availabilityText;
        set => SetProperty(ref _availabilityText, value);
    }

    public bool IsUpdateAvailable
    {
        get => _isUpdateAvailable;
        set => SetProperty(ref _isUpdateAvailable, value);
    }

    public bool CanOpenSelectedAsset
    {
        get => _canOpenSelectedAsset;
        set => SetProperty(ref _canOpenSelectedAsset, value);
    }
}
