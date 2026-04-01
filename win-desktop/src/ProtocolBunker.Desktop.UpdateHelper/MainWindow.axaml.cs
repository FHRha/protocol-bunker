using Avalonia.Controls;
using Avalonia.Interactivity;
using ProtocolBunker.Desktop.UpdateHelper.Services;

namespace ProtocolBunker.Desktop.UpdateHelper;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private UpdateShell Shell => (UpdateShell)DataContext!;

    private void CancelClick(object? sender, RoutedEventArgs e) => Shell.Cancel();
    private void CloseClick(object? sender, RoutedEventArgs e) => Close();
}
