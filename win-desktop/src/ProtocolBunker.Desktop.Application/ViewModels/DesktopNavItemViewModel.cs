using ProtocolBunker.Desktop.Contracts.Models;
using System.Windows.Input;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class DesktopNavItemViewModel : ViewModelBase
{
    private bool _isSelected;

    public DesktopNavItemViewModel(DesktopSection section, DesktopTextCatalog textCatalog, ICommand selectCommand)
    {
        Section = section;
        T = textCatalog;
        SelectCommand = selectCommand;
        T.PropertyChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(Title));
            OnPropertyChanged(nameof(Subtitle));
        };
    }

    public DesktopSection Section { get; }

    public DesktopTextCatalog T { get; }

    public ICommand SelectCommand { get; }

    public string Title => T.SectionTitle(Section);

    public string Subtitle => T.SectionSubtitle(Section);

    public bool IsSelected
    {
        get => _isSelected;
        set => SetProperty(ref _isSelected, value);
    }
}
