using System.Windows.Input;
using ProtocolBunker.Desktop.Application.ViewModels;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class NetworkSectionViewModelTests
{
    private sealed class NoopCommand : ICommand
    {
#pragma warning disable CS0067
        public event EventHandler? CanExecuteChanged;
#pragma warning restore CS0067
        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) { }
    }

    [Fact]
    public void ModeSelectionSurvivesLanguageChangeAfterDomainToLocalRoundtrip()
    {
        var localization = new FakeLocalizationService();
        var texts = new DesktopTextCatalog(localization);
        var viewModel = new NetworkSectionViewModel(texts, new NoopCommand(), new NoopCommand());

        viewModel.EditableMode = "domain";
        viewModel.EditableMode = "local";

        localization.SetLanguage("en");

        Assert.Equal("local", viewModel.EditableMode);
        Assert.Equal(0, viewModel.SelectedModeIndex);
        Assert.Equal("Local network", viewModel.ModeOptions[0].Label);
        Assert.Equal("Domain", viewModel.ModeOptions[1].Label);
    }

    [Fact]
    public void ModeSelectionSurvivesLanguageChangeWhileDomainRemainsSelected()
    {
        var localization = new FakeLocalizationService();
        var texts = new DesktopTextCatalog(localization);
        var viewModel = new NetworkSectionViewModel(texts, new NoopCommand(), new NoopCommand());

        viewModel.SelectedModeIndex = 1;
        localization.SetLanguage("en");

        Assert.Equal("domain", viewModel.EditableMode);
        Assert.Equal(1, viewModel.SelectedModeIndex);
        Assert.Equal("Domain", viewModel.ModeOptions[1].Label);
    }
}
