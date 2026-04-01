using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class NetworkSectionViewModel : ViewModelBase
{
    public sealed class ModeOption : ViewModelBase
    {
        private string _label;

        public ModeOption(string value, string label)
        {
            Value = value;
            _label = label;
        }

        public string Value { get; }

        public string Label
        {
            get => _label;
            set => SetProperty(ref _label, value);
        }
    }

    private string _editableMode = "local";
    private string _editablePort = "8080";
    private string _editablePublicHost = string.Empty;
    private string _editableDomain = string.Empty;
    private string _editableDataRoot = string.Empty;
    private bool _editableDeveloperMode;
    private string _settingsStatus;
    private bool _isSettingsLocked;
    private string _lockReason;
    private int _selectedModeIndex;
    private readonly ModeOption _localModeOption;
    private readonly ModeOption _domainModeOption;

    public NetworkSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand saveSettingsCommand,
        ICommand openDataRootCommand)
    {
        T = textCatalog;
        _localModeOption = new ModeOption("local", textCatalog.ModeLocal);
        _domainModeOption = new ModeOption("domain", textCatalog.ModeDomain);
        T.PropertyChanged += (_, _) => RefreshModeOptionLabels();
        _settingsStatus = textCatalog.PlaceholderNotAvailable;
        _lockReason = string.Empty;
        SaveSettingsCommand = saveSettingsCommand;
        OpenDataRootCommand = openDataRootCommand;
    }

    public DesktopTextCatalog T { get; }

    public IReadOnlyList<ModeOption> ModeOptions => [_localModeOption, _domainModeOption];

    public ICommand SaveSettingsCommand { get; }

    public ICommand OpenDataRootCommand { get; }

    public string EditableMode
    {
        get => _editableMode;
        set
        {
            if (SetProperty(ref _editableMode, value))
            {
                SelectedModeIndex = string.Equals(_editableMode, "domain", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
            }
        }
    }

    public int SelectedModeIndex
    {
        get => _selectedModeIndex;
        set
        {
            if (SetProperty(ref _selectedModeIndex, value))
            {
                var next = value == 1 ? "domain" : "local";
                if (!string.Equals(_editableMode, next, StringComparison.OrdinalIgnoreCase))
                {
                    _editableMode = next;
                    OnPropertyChanged(nameof(EditableMode));
                }
            }
        }
    }

    public string EditablePort
    {
        get => _editablePort;
        set => SetProperty(ref _editablePort, value);
    }

    public string EditablePublicHost
    {
        get => _editablePublicHost;
        set => SetProperty(ref _editablePublicHost, value);
    }

    public string EditableDomain
    {
        get => _editableDomain;
        set => SetProperty(ref _editableDomain, value);
    }

    public string EditableDataRoot
    {
        get => _editableDataRoot;
        set => SetProperty(ref _editableDataRoot, value);
    }

    public bool EditableDeveloperMode
    {
        get => _editableDeveloperMode;
        set => SetProperty(ref _editableDeveloperMode, value);
    }

    public string SettingsStatus
    {
        get => _settingsStatus;
        set => SetProperty(ref _settingsStatus, value);
    }

    public bool IsSettingsLocked
    {
        get => _isSettingsLocked;
        set => SetProperty(ref _isSettingsLocked, value);
    }

    public string LockReason
    {
        get => _lockReason;
        set => SetProperty(ref _lockReason, value);
    }

    private void RefreshModeOptionLabels()
    {
        _localModeOption.Label = T.ModeLocal;
        _domainModeOption.Label = T.ModeDomain;
        OnPropertyChanged(nameof(ModeOptions));
    }
}
