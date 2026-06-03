/**
 * Подтверждение действий вместо window.confirm (в WebView VK на iOS confirm часто не показывается).
 */
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Box, Button, Text } from '@vkontakte/vkui';

export function SeashellConfirm({
  mountEl,
  open,
  title,
  message,
  confirmLabel = 'Да',
  cancelLabel = 'Отмена',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  if (!open || !mountEl) return null;

  return createPortal(
    <div className="seashell-confirm-shell seashell-crt" role="presentation">
      <button type="button" className="seashell-confirm-shell__backdrop" aria-label="Закрыть" onClick={onCancel} />
      <div className="seashell-confirm-shell__dialog" role="alertdialog" aria-modal="true" aria-labelledby="seashell-confirm-title">
        <Box className="seashell-confirm-shell__body">
          <Text weight="2" id="seashell-confirm-title" style={{ lineHeight: 1.4 }}>
            {title}
          </Text>
          {message ? (
            <Text style={{ marginTop: 10, lineHeight: 1.5, opacity: 0.9 }}>{message}</Text>
          ) : null}
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            <Button
              type="button"
              size="l"
              stretched
              mode={destructive ? 'primary' : 'secondary'}
              appearance={destructive ? 'negative' : 'accent'}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
            <Button type="button" size="l" stretched mode="tertiary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </Box>
        </Box>
      </div>
    </div>,
    mountEl,
  );
}

SeashellConfirm.propTypes = {
  mountEl: PropTypes.object,
  open: PropTypes.bool,
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  destructive: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
