import { Panel, PanelHeader, Header, Group, Cell, Avatar } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

/** Короткие тезисы (EN): естественные формулировки для носителя */
const HOME_TAGLINES_EN = [
  'Learn by doing.',
  'Grow your vocabulary.',
  'Keep practicing.',
  'Speak up.',
];

export const Home = ({ id, fetchedUser }) => {
  const { photo_200, city, first_name, last_name } = { ...fetchedUser };
  const routeNavigator = useRouteNavigator();
  return (
    <Panel id={id}>
      <PanelHeader>Главная</PanelHeader>
      <Group>
        <div className="seashell-home-tagline" lang="en">
          {HOME_TAGLINES_EN.map((line, i) => (
            <span
              key={line}
              className={
                i === 0
                  ? 'seashell-home-tagline__line seashell-home-tagline__line--lead'
                  : 'seashell-home-tagline__line'
              }
            >
              {line}
            </span>
          ))}
        </div>
      </Group>

      {fetchedUser && (
        <Group header={<Header size="s">Профиль</Header>}>
          <Cell before={photo_200 && <Avatar src={photo_200} />} subtitle={city?.title}>
            {`${first_name} ${last_name}`}
          </Cell>
        </Group>
      )}

      <Group header={<Header size="s">Разделы</Header>}>
        <Cell onClick={() => routeNavigator.push('dictionary')} chevron="always">
          Словарь
        </Cell>
        <Cell onClick={() => routeNavigator.push('practice')} chevron="always">
          Разговорная практика
        </Cell>
        <Cell onClick={() => routeNavigator.push('settings')} chevron="always">
          Настройки
        </Cell>
        <Cell onClick={() => routeNavigator.push('readme')} chevron="always">
          Справка
        </Cell>
      </Group>
    </Panel>
  );
};

Home.propTypes = {
  id: PropTypes.string.isRequired,
  fetchedUser: PropTypes.shape({
    photo_200: PropTypes.string,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    city: PropTypes.shape({
      title: PropTypes.string,
    }),
  }),
};
