import ReactMarkdown from "react-markdown";
import rulesEnText from "../../../locales/ui/rules/en.md?raw";
import rulesRuText from "../../../locales/ui/rules/ru.md?raw";
import { getCurrentLocale, useUiLocaleNamespace } from "../localization";
import Modal from "./Modal";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  const text = useUiLocaleNamespace("rules", { fallbacks: ["common"] });
  const title = text.t("rulesTitle");
  const rulesText = getCurrentLocale() === "en" ? rulesEnText : rulesRuText;

  return (
    <Modal open={open} title={title} onClose={onClose} dismissible={true} className="rules-modal">
      <div className="rules-modal-body">
        <ReactMarkdown>{rulesText}</ReactMarkdown>
      </div>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          {text.t("closeButton")}
        </button>
      </div>
    </Modal>
  );
}

