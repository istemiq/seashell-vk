import { useCallback, useEffect, useState } from 'react';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Button,
  ButtonGroup,
  Div,
  Text,
  Footnote,
  Spacing,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

const RATE_MIN = 0.5;
const RATE_MAX = 2;
const RATE_STEP = 0.1;

const DEMO_PHRASE = 'Hello. Could you repeat that a bit slower, please?';

function formatRate(rate) {
  return rate.toFixed(1).replace('.', ',');
}

export const Practice = ({ id }) => {
  const routeNavigator = useRouteNavigator();
  const [active, setActive] = useState(false);
  const [rate, setRate] = useState(1);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakDemo = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(DEMO_PHRASE);
    u.lang = 'en-US';
    u.rate = Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
    window.speechSynthesis.speak(u);
  }, [rate]);

  useEffect(() => {
    return () => stopSpeech();
  }, [stopSpeech]);

  const slower = () => setRate((r) => Math.max(RATE_MIN, Math.round((r - RATE_STEP) * 10) / 10));
  const faster = () => setRate((r) => Math.min(RATE_MAX, Math.round((r + RATE_STEP) * 10) / 10));

  const start = () => {
    setActive(true);
  };

  const end = () => {
    stopSpeech();
    setActive(false);
  };

  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis;

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>
        Разговорная практика
      </PanelHeader>

      {!active && (
        <Group>
          <Div>
            <Text weight="2">Начните сессию — появятся настройки скорости голоса и тестовая озвучка.</Text>
            <Spacing size={16} />
            <Button size="l" stretched onClick={start}>
              Начать практику
            </Button>
          </Div>
        </Group>
      )}

      {active && (
        <>
          <Group header={<Header mode="secondary">Практика</Header>}>
            <Div>
              <Text>Скорость озвучки: {formatRate(rate)}× (от {RATE_MIN}× до {RATE_MAX}×)</Text>
              <Spacing size={12} />
              <ButtonGroup stretched mode="horizontal" gap="s">
                <Button size="m" stretched mode="secondary" onClick={slower} disabled={rate <= RATE_MIN}>
                  Медленнее
                </Button>
                <Button size="m" stretched mode="secondary" onClick={faster} disabled={rate >= RATE_MAX}>
                  Быстрее
                </Button>
              </ButtonGroup>
              <Spacing size={12} />
              <Button
                size="m"
                stretched
                mode="tertiary"
                onClick={speakDemo}
                disabled={!canSpeak}
              >
                Прослушать пример
              </Button>
              {!canSpeak && (
                <>
                  <Spacing size={8} />
                  <Footnote>Озвучка недоступна в этом окружении (нет Web Speech API).</Footnote>
                </>
              )}
              <Spacing size={16} />
              <Button size="l" stretched mode="secondary" onClick={end}>
                Закончить практику
              </Button>
            </Div>
          </Group>
        </>
      )}
    </Panel>
  );
};

Practice.propTypes = {
  id: PropTypes.string.isRequired,
};
