using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class HomeSectionViewModel : ViewModelBase
{
    private string _version;
    private string _runtimeState;
    private string _runtimeSource;
    private string _activeMode;
    private string _port;
    private string _roomCode;
    private string _reachability;
    private string _installRoot;
    private string _appRoot;
    private string _dataRoot;
    private string _publicHost;
    private string _domain;
    private string _developerMode;
    private string _processId;
    private string _statusDetail;
    private string _playerUrlInternal;
    private string _playerUrlExternal;
    private string _asciiFrame;

    public HomeSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand startRuntimeCommand,
        ICommand stopRuntimeCommand,
        ICommand openDataRootCommand,
        ICommand openPlayerInternalCommand,
        ICommand openPlayerExternalCommand,
        ICommand copyPlayerInternalCommand,
        ICommand copyPlayerExternalCommand)
    {
        T = textCatalog;
        _version = textCatalog.PlaceholderLoading;
        _runtimeState = textCatalog.PlaceholderLoading;
        _runtimeSource = textCatalog.PlaceholderNotAvailable;
        _activeMode = textCatalog.PlaceholderNotAvailable;
        _port = textCatalog.PlaceholderNotAvailable;
        _roomCode = textCatalog.PlaceholderNotAvailable;
        _reachability = textCatalog.PlaceholderNotAvailable;
        _installRoot = textCatalog.PlaceholderNotAvailable;
        _appRoot = textCatalog.PlaceholderNotAvailable;
        _dataRoot = textCatalog.PlaceholderNotAvailable;
        _publicHost = textCatalog.PlaceholderNotAvailable;
        _domain = textCatalog.PlaceholderNotAvailable;
        _developerMode = textCatalog.PlaceholderNotAvailable;
        _processId = textCatalog.PlaceholderNotAvailable;
        _statusDetail = textCatalog.PlaceholderNotAvailable;
        _playerUrlInternal = textCatalog.PlaceholderNotAvailable;
        _playerUrlExternal = textCatalog.PlaceholderNotAvailable;
        _asciiFrame = string.Empty;
        StartRuntimeCommand = startRuntimeCommand;
        StopRuntimeCommand = stopRuntimeCommand;
        OpenDataRootCommand = openDataRootCommand;
        OpenPlayerInternalCommand = openPlayerInternalCommand;
        OpenPlayerExternalCommand = openPlayerExternalCommand;
        CopyPlayerInternalCommand = copyPlayerInternalCommand;
        CopyPlayerExternalCommand = copyPlayerExternalCommand;
    }

    public DesktopTextCatalog T { get; }

    public ICommand StartRuntimeCommand { get; }

    public ICommand StopRuntimeCommand { get; }

    public ICommand OpenDataRootCommand { get; }

    public ICommand OpenPlayerInternalCommand { get; }

    public ICommand OpenPlayerExternalCommand { get; }

    public ICommand CopyPlayerInternalCommand { get; }

    public ICommand CopyPlayerExternalCommand { get; }

    public string Version
    {
        get => _version;
        set => SetProperty(ref _version, value);
    }

    public string RuntimeState
    {
        get => _runtimeState;
        set => SetProperty(ref _runtimeState, value);
    }

    public string RuntimeSource
    {
        get => _runtimeSource;
        set => SetProperty(ref _runtimeSource, value);
    }

    public string ActiveMode
    {
        get => _activeMode;
        set => SetProperty(ref _activeMode, value);
    }

    public string Port
    {
        get => _port;
        set => SetProperty(ref _port, value);
    }

    public string RoomCode
    {
        get => _roomCode;
        set => SetProperty(ref _roomCode, value);
    }

    public string Reachability
    {
        get => _reachability;
        set => SetProperty(ref _reachability, value);
    }

    public string InstallRoot
    {
        get => _installRoot;
        set => SetProperty(ref _installRoot, value);
    }

    public string AppRoot
    {
        get => _appRoot;
        set => SetProperty(ref _appRoot, value);
    }

    public string DataRoot
    {
        get => _dataRoot;
        set => SetProperty(ref _dataRoot, value);
    }

    public string PublicHost
    {
        get => _publicHost;
        set => SetProperty(ref _publicHost, value);
    }

    public string Domain
    {
        get => _domain;
        set => SetProperty(ref _domain, value);
    }

    public string DeveloperMode
    {
        get => _developerMode;
        set => SetProperty(ref _developerMode, value);
    }

    public string ProcessId
    {
        get => _processId;
        set => SetProperty(ref _processId, value);
    }

    public string StatusDetail
    {
        get => _statusDetail;
        set => SetProperty(ref _statusDetail, value);
    }

    public string PlayerUrlInternal
    {
        get => _playerUrlInternal;
        set => SetProperty(ref _playerUrlInternal, value);
    }

    public string PlayerUrlExternal
    {
        get => _playerUrlExternal;
        set => SetProperty(ref _playerUrlExternal, value);
    }

    public string AsciiFrame
    {
        get => _asciiFrame;
        set => SetProperty(ref _asciiFrame, value);
    }
}
