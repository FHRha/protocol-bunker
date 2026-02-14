import ReactMarkdown from "react-markdown";
import rulesText from "../content/rules.md?raw";
import { ru } from "../i18n/ru";
import Modal from "./Modal";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  const title = "\u041f\u0440\u0430\u0432\u0438\u043b\u0430";

  return (
    <Modal open={open} title={title} onClose={onClose} dismissible={true} className="rules-modal">
      <div className="rules-modal-body">
        <ReactMarkdown>{rulesText}</ReactMarkdown>
      </div>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          {ru.closeButton}
        </button>
      </div>
    </Modal>
  );
}
