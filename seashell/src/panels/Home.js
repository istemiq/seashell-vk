import { useMemo, useState } from 'react';
import { Panel, PanelHeader, Header, Group, Cell, Avatar, Text, Button } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import { SeashellBootlog } from '../components/SeashellBootlog';
import { loadSettings, updateSettings } from '../utils/settings.js';

export const Home = ({ id, fetchedUser }) => {
  const { photo_200, city, first_name, last_name } = { ...fetchedUser };
  const routeNavigator = useRouteNavigator();
  const userDisplayName = fetchedUser
    ? [first_name, last_name].filter(Boolean).join(' ').trim()
    : '';

  const initialSettings = useMemo(() => loadSettings(), []);
  const [onboarded, setOnboarded] = useState(!!initialSettings.onboarded);

  return (
    <Panel id={id}>
      <PanelHeader>Главная</PanelHeader>
      <Group>
        <SeashellBootlog userDisplayName={userDisplayName} />
      </Group>

      {!onboarded && (
        <Group header={<Header size="s">Как пользоваться</Header>}>
          <Text style={{ lineHeight: 1.55 }}>
            - **Словарь**: добавь слово или фразу — получишь краткое значение и примеры.
            <br />
            - **Практика**: напиши/продиктуй фразу — собеседник ответит и при необходимости подскажет правку.
          </Text>
          <Button
            size="m"
            stretched
            style={{ marginTop: 12 }}
            onClick={() => {
              updateSettings({ onboarded: true });
              setOnboarded(true);
            }}
          >
            Понятно
          </Button>
        </Group>
      )}
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
