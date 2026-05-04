import { Panel, PanelHeader, PanelHeaderBack, Group, Header, Text } from '@vkontakte/vkui';
import PropTypes from 'prop-types';

import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';

export const Readme = ({ id }) => {
  const goBackOrHome = useNavigateBackOrHome();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => void goBackOrHome()} />}>Справка</PanelHeader>

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
