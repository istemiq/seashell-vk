import { Panel, PanelHeader, PanelHeaderBack, Group, Header, Text } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

export const Readme = ({ id }) => {
  const routeNavigator = useRouteNavigator();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>Справка</PanelHeader>

      <Group header={<Header mode="secondary">Что здесь есть</Header>}>
        <Text style={{ lineHeight: 1.55 }}>
          <strong>Seashell</strong> помогает учить английский во ВКонтакте: можно собирать слова с примерами и переводом
          и тренировать живой диалог с обратной связью по фразам.
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Разделы</Header>}>
        <Text style={{ lineHeight: 1.55 }}>
          <strong>Словарь</strong> — добавляешь слово или фразу, получаешь краткое значение по-русски и набор примеров;
          можно прослушать произношение.
          <br />
          <br />
          <strong>Практика</strong> — пишешь или надиктовываешь по-английски; показывается, как сказано услышано, при
          необходимости короткие правки и ответ собеседника.
        </Text>
      </Group>
    </Panel>
  );
};

Readme.propTypes = {
  id: PropTypes.string.isRequired,
};
