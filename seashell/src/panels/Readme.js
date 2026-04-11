import { Panel, PanelHeader, PanelHeaderBack, Placeholder } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

export const Readme = ({ id }) => {
  const routeNavigator = useRouteNavigator();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>
        Ридми
      </PanelHeader>
      <Placeholder>Здесь будет раздел с описанием и инструкциями.</Placeholder>
    </Panel>
  );
};

Readme.propTypes = {
  id: PropTypes.string.isRequired,
};

