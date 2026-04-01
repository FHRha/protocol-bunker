using System.Collections.ObjectModel;
using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class DiagnosticsSectionViewModel : ViewModelBase
{
    private string _logSearchText = string.Empty;

    public DiagnosticsSectionViewModel(
        DesktopTextCatalog textCatalog,
        ICommand copyAllLogsCommand,
        ICommand clearLogsCommand)
    {
        T = textCatalog;
        CopyAllLogsCommand = copyAllLogsCommand;
        ClearLogsCommand = clearLogsCommand;
    }

    public DesktopTextCatalog T { get; }

    public ICommand CopyAllLogsCommand { get; }

    public ICommand ClearLogsCommand { get; }

    public ObservableCollection<RuntimeLogItemViewModel> VisibleLogs { get; } = [];

    public string LogSearchText
    {
        get => _logSearchText;
        set => SetProperty(ref _logSearchText, value);
    }
}
