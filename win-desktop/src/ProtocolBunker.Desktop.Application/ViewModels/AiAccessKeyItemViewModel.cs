using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class AiAccessKeyItemViewModel : ViewModelBase
{
    private bool _isSelected;

    public AiAccessKeyItemViewModel(AiAccessKeyRecordModel model)
    {
        Id = model.Id;
        Label = model.Label;
        Scopes = model.Scopes;
        CreatedAt = model.CreatedAt;
        LastUsedAt = string.IsNullOrWhiteSpace(model.LastUsedAt) ? "-" : model.LastUsedAt;
        RevokedAt = string.IsNullOrWhiteSpace(model.RevokedAt) ? "-" : model.RevokedAt;
        IsRevoked = model.IsRevoked;
    }

    public string Id { get; }

    public string Label { get; }

    public string Scopes { get; }

    public string CreatedAt { get; }

    public string LastUsedAt { get; }

    public string RevokedAt { get; }

    public bool IsRevoked { get; }

    public string Status => IsRevoked ? "revoked" : "active";

    public string DisplayLabel => string.IsNullOrWhiteSpace(Label) ? "-" : Label;

    public bool IsSelected
    {
        get => _isSelected;
        set => SetProperty(ref _isSelected, value);
    }
}
