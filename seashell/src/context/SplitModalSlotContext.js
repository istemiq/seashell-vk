import { createContext } from 'react';

/** Узел из `App`: фиксированный приёмник для createPortal(ModalRoot), вне Panel/SplitLayout.flex. */
export const SplitModalSlotContext = createContext(null);
