using System.Collections.ObjectModel;
using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class AiKeysSectionViewModel : ViewModelBase
{
    private string _newKeyLabel = string.Empty;
    private string _createdKey = string.Empty;
    private string _validateKey = string.Empty;
    private string _validationStatusText = string.Empty;
    private string _editableSelectedLabel = string.Empty;
    private string _statusMessage;
    private string _keysFilePath;
    private bool _isValidationSuccess;
    private bool _isValidationFailure;
    private AiAccessKeyItemViewModel? _selectedKey;

    public AiKeysSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand refreshCommand,
        ICommand createCommand,
        ICommand copyCreatedCommand,
        ICommand saveSelectedLabelCommand,
        ICommand revokeSelectedCommand,
        ICommand deleteSelectedCommand,
        ICommand validateCommand)
    {
        T = textCatalog;
        RefreshCommand = refreshCommand;
        CreateCommand = createCommand;
        CopyCreatedCommand = copyCreatedCommand;
        SaveSelectedLabelCommand = saveSelectedLabelCommand;
        RevokeSelectedCommand = revokeSelectedCommand;
        DeleteSelectedCommand = deleteSelectedCommand;
        ValidateCommand = validateCommand;
        _statusMessage = textCatalog.PlaceholderNotAvailable;
        _keysFilePath = textCatalog.PlaceholderNotAvailable;
    }

    public DesktopTextCatalog T { get; }

    public ObservableCollection<AiAccessKeyItemViewModel> Keys { get; } = [];

    public ICommand RefreshCommand { get; }

    public ICommand CreateCommand { get; }

    public ICommand CopyCreatedCommand { get; }

    public ICommand SaveSelectedLabelCommand { get; }

    public ICommand RevokeSelectedCommand { get; }

    public ICommand DeleteSelectedCommand { get; }

    public ICommand ValidateCommand { get; }

    public string NewKeyLabel
    {
        get => _newKeyLabel;
        set => SetProperty(ref _newKeyLabel, value);
    }

    public string CreatedKey
    {
        get => _createdKey;
        set
        {
            if (SetProperty(ref _createdKey, value))
            {
                OnPropertyChanged(nameof(HasCreatedKey));
            }
        }
    }

    public bool HasCreatedKey => !string.IsNullOrWhiteSpace(CreatedKey);

    public string ValidateKey
    {
        get => _validateKey;
        set => SetProperty(ref _validateKey, value);
    }

    public string ValidationStatusText
    {
        get => _validationStatusText;
        set => SetProperty(ref _validationStatusText, value);
    }

    public bool IsValidationSuccess
    {
        get => _isValidationSuccess;
        set => SetProperty(ref _isValidationSuccess, value);
    }

    public bool IsValidationFailure
    {
        get => _isValidationFailure;
        set => SetProperty(ref _isValidationFailure, value);
    }

    public string EditableSelectedLabel
    {
        get => _editableSelectedLabel;
        set => SetProperty(ref _editableSelectedLabel, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public string KeysFilePath
    {
        get => _keysFilePath;
        set => SetProperty(ref _keysFilePath, value);
    }

    public AiAccessKeyItemViewModel? SelectedKey
    {
        get => _selectedKey;
        set
        {
            if (SetProperty(ref _selectedKey, value))
            {
                foreach (var key in Keys)
                {
                    key.IsSelected = ReferenceEquals(key, value);
                }

                EditableSelectedLabel = value?.Label ?? string.Empty;
                OnPropertyChanged(nameof(HasSelectedKey));
            }
        }
    }

    public bool HasSelectedKey => SelectedKey is not null;
}
