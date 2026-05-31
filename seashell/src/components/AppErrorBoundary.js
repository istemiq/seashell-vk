import { Component } from 'react';
import PropTypes from 'prop-types';

/** Без VKUI: boundary может сработать до ConfigProvider. */
export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[Seashell]', error);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: '24px 16px',
          lineHeight: 1.5,
          color: '#e6edf3',
          background: '#0a0e14',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Не удалось загрузить Seashell</p>
        <p style={{ margin: '0 0 16px', opacity: 0.85 }}>
          Нажмите «Обновить». Если не помогло — закройте мини-приложение и откройте снова из меню VK.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: 16,
            border: 0,
            borderRadius: 8,
            background: '#528bcc',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Обновить
        </button>
      </div>
    );
  }
}

AppErrorBoundary.propTypes = {
  children: PropTypes.node,
};
