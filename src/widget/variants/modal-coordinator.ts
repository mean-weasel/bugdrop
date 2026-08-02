interface ActiveVariantModal {
  close(): void;
}

let activeVariantModal: ActiveVariantModal | undefined;

export function closeActiveVariantModal(): void {
  activeVariantModal?.close();
}

export function setActiveVariantModal(modal: ActiveVariantModal): () => void {
  activeVariantModal = modal;
  return () => {
    if (activeVariantModal === modal) activeVariantModal = undefined;
  };
}
