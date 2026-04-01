using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class AccessSectionViewModel : ViewModelBase
{
    private string _editableRoomCode = string.Empty;
    private string _internalBaseUrl;
    private string _externalBaseUrl;
    private string _overlayUrlInternal;
    private string _overlayUrlExternal;
    private string _controlInviteUrlInternal;
    private string _controlInviteUrlExternal;
    private string _accessStatus;

    public AccessSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand refreshLinksCommand,
        ICommand createControlInviteCommand,
        ICommand copyInternalBaseCommand,
        ICommand copyExternalBaseCommand,
        ICommand openInternalBaseCommand,
        ICommand openExternalBaseCommand,
        ICommand copyOverlayInternalCommand,
        ICommand copyOverlayExternalCommand,
        ICommand openOverlayInternalCommand,
        ICommand openOverlayExternalCommand,
        ICommand copyControlInternalCommand,
        ICommand copyControlExternalCommand,
        ICommand openControlInternalCommand,
        ICommand openControlExternalCommand)
    {
        T = textCatalog;
        _internalBaseUrl = textCatalog.PlaceholderNotAvailable;
        _externalBaseUrl = textCatalog.PlaceholderNotAvailable;
        _overlayUrlInternal = textCatalog.PlaceholderNotAvailable;
        _overlayUrlExternal = textCatalog.PlaceholderNotAvailable;
        _controlInviteUrlInternal = textCatalog.PlaceholderNotAvailable;
        _controlInviteUrlExternal = textCatalog.PlaceholderNotAvailable;
        _accessStatus = textCatalog.PlaceholderNotAvailable;
        RefreshLinksCommand = refreshLinksCommand;
        CreateControlInviteCommand = createControlInviteCommand;
        CopyInternalBaseCommand = copyInternalBaseCommand;
        CopyExternalBaseCommand = copyExternalBaseCommand;
        OpenInternalBaseCommand = openInternalBaseCommand;
        OpenExternalBaseCommand = openExternalBaseCommand;
        CopyOverlayInternalCommand = copyOverlayInternalCommand;
        CopyOverlayExternalCommand = copyOverlayExternalCommand;
        OpenOverlayInternalCommand = openOverlayInternalCommand;
        OpenOverlayExternalCommand = openOverlayExternalCommand;
        CopyControlInternalCommand = copyControlInternalCommand;
        CopyControlExternalCommand = copyControlExternalCommand;
        OpenControlInternalCommand = openControlInternalCommand;
        OpenControlExternalCommand = openControlExternalCommand;
    }

    public DesktopTextCatalog T { get; }

    public ICommand RefreshLinksCommand { get; }

    public ICommand CreateControlInviteCommand { get; }

    public ICommand CopyInternalBaseCommand { get; }

    public ICommand CopyExternalBaseCommand { get; }

    public ICommand OpenInternalBaseCommand { get; }

    public ICommand OpenExternalBaseCommand { get; }

    public ICommand CopyOverlayInternalCommand { get; }

    public ICommand CopyOverlayExternalCommand { get; }

    public ICommand OpenOverlayInternalCommand { get; }

    public ICommand OpenOverlayExternalCommand { get; }

    public ICommand CopyControlInternalCommand { get; }

    public ICommand CopyControlExternalCommand { get; }

    public ICommand OpenControlInternalCommand { get; }

    public ICommand OpenControlExternalCommand { get; }

    public string EditableRoomCode
    {
        get => _editableRoomCode;
        set => SetProperty(ref _editableRoomCode, value);
    }

    public string InternalBaseUrl
    {
        get => _internalBaseUrl;
        set => SetProperty(ref _internalBaseUrl, value);
    }

    public string ExternalBaseUrl
    {
        get => _externalBaseUrl;
        set => SetProperty(ref _externalBaseUrl, value);
    }

    public string OverlayUrlInternal
    {
        get => _overlayUrlInternal;
        set => SetProperty(ref _overlayUrlInternal, value);
    }

    public string OverlayUrlExternal
    {
        get => _overlayUrlExternal;
        set => SetProperty(ref _overlayUrlExternal, value);
    }

    public string ControlInviteUrlInternal
    {
        get => _controlInviteUrlInternal;
        set => SetProperty(ref _controlInviteUrlInternal, value);
    }

    public string ControlInviteUrlExternal
    {
        get => _controlInviteUrlExternal;
        set => SetProperty(ref _controlInviteUrlExternal, value);
    }

    public string AccessStatus
    {
        get => _accessStatus;
        set => SetProperty(ref _accessStatus, value);
    }
}
