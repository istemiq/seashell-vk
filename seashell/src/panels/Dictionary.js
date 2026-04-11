import { Panel, PanelHeader, PanelHeaderBack, Placeholder } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

export const Dictionary = ({ id }) => {
  const routeNavigator = useRouteNavigator();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>
        Словарь
      </PanelHeader>
      <Placeholder>Здесь будет словарь.</Placeholder>
    </Panel>
  );
};

Dictionary.propTypes = {
  id: PropTypes.string.isRequired,
};

