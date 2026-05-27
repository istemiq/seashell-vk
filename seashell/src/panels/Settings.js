import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  FormItem,
  Switch,
  Slider,
  Select,
} from '@vkontakte/vkui';
import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import { loadSettings, updateSettings } from '../utils/settings.js';
import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';

export const Settings = ({ id }) => {
  const goBackOrHome = useNavigateBackOrHome();
  const initial = useMemo(() => loadSettings(), []);
  const [s, setS] = useState(initial);

  const setAndPersist = (patch) => {
    const next = updateSettings(patch);
    setS(next);
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => void goBackOrHome()} />}>Настройки</PanelHeader>

      <Group header={<Header mode="secondary">Озвучка</Header>}>
        <FormItem top="Включить озвучку (TTS)">
          <Switch checked={!!s.ttsEnabled} onChange={(e) => setAndPersist({ ttsEnabled: e.target.checked })} />
        </FormItem>
        <FormItem top="Акцент">
          <Select
            value={String(s.ttsLocale || 'en-US')}
            options={[
              { label: 'Американский (en-US)', value: 'en-US' },
              { label: 'Британский (en-GB)', value: 'en-GB' },
            ]}
            onChange={(e) => setAndPersist({ ttsLocale: e.target.value })}
            disabled={!s.ttsEnabled}
          />
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

    </Panel>
  );
};

Settings.propTypes = {
  id: PropTypes.string.isRequired,
};

