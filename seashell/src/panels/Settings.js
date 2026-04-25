import { Panel, PanelHeader, PanelHeaderBack, Group, Header, FormItem, Switch, Slider, Select } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import { loadSettings, updateSettings } from '../utils/settings.js';

const toneOptions = [
  { label: 'Нейтрально', value: 'neutral' },
  { label: 'Дружелюбно', value: 'friendly' },
  { label: 'Строго (коротко и по делу)', value: 'strict' },
];

export const Settings = ({ id }) => {
  const routeNavigator = useRouteNavigator();
  const initial = useMemo(() => loadSettings(), []);
  const [s, setS] = useState(initial);

  const setAndPersist = (patch) => {
    const next = updateSettings(patch);
    setS(next);
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>Настройки</PanelHeader>

      <Group header={<Header mode="secondary">Озвучка</Header>}>
        <FormItem top="Включить озвучку (TTS)">
          <Switch checked={!!s.ttsEnabled} onChange={(e) => setAndPersist({ ttsEnabled: e.target.checked })} />
        </FormItem>
        <FormItem top={`Скорость озвучки: ${Number(s.ttsRate).toFixed(2)}`}>
          <Slider
            min={0.7}
            max={1.2}
            step={0.05}
            value={Number(s.ttsRate) || 0.95}
            onChange={(v) => setAndPersist({ ttsRate: v })}
            disabled={!s.ttsEnabled}
          />
        </FormItem>
      </Group>

      <Group header={<Header mode="secondary">Практика</Header>}>
        <FormItem top="Стиль собеседника">
          <Select
            value={s.practiceTone || 'neutral'}
            options={toneOptions}
            onChange={(e) => setAndPersist({ practiceTone: e.target.value })}
          />
        </FormItem>
      </Group>
    </Panel>
  );
};

Settings.propTypes = {
  id: PropTypes.string.isRequired,
};

