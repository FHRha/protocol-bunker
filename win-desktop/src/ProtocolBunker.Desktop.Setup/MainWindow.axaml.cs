using Avalonia.Controls;
using Avalonia.Interactivity;
using ProtocolBunker.Desktop.Setup.Services;

namespace ProtocolBunker.Desktop.Setup;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private SetupShell Shell => (SetupShell)DataContext!;

    private void RussianLanguageClick(object? sender, RoutedEventArgs e) => Shell.SetLanguage("ru");
    private void EnglishLanguageClick(object? sender, RoutedEventArgs e) => Shell.SetLanguage("en");
    private async void StartClick(object? sender, RoutedEventArgs e) => await Shell.StartAsync();
    private void StopClick(object? sender, RoutedEventArgs e) => Shell.Stop();
    private void CloseClick(object? sender, RoutedEventArgs e)
    {
        Shell.ScheduleSelfDeleteOnClose();
        Close();
    }
}
