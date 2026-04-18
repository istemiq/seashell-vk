import { useCallback, useEffect, useRef, useState } from 'react';
import bridge from '@vkontakte/vk-bridge';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Button,
  Box,
  Text,
  Footnote,
  Textarea,
  FormItem,
  Separator,
  Spinner,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import { setVkUserIdFallback } from '../api/dictionaryApi.js';
import * as practiceApi from '../api/practiceApi.js';
import { getVkUserIdFromLocation } from '../utils/vkUserId.js';
import { withTimeout } from '../utils/withTimeout.js';

/** Разговорная практика: текст и голос (распознавание в браузере), ответ бэкенда — эхо, правки, реплика. */

const BRIDGE_GET_USER_MS = 8000;
const DEV_FALLBACK_VK_USER_ID = Number(import.meta.env.VITE_DEV_VK_USER_ID) || 1000001;

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const Practice = ({ id }) => {
  const routeNavigator = useRouteNavigator();
  const [vkReady, setVkReady] = useState(() => !!getVkUserIdFromLocation());
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  // Определяем vk_user_id для заголовка X-VK-User-Id (как в словаре).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getVkUserIdFromLocation()) {
        setVkReady(true);
        return;
      }
      try {
        const u = await withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_GET_USER_MS);
        if (cancelled || !u?.id) return;
        setVkUserIdFallback(u.id);
        setVkReady(true);
      } catch {
        if (cancelled) return;
        if (!bridge.isWebView()) {
          setVkUserIdFallback(DEV_FALLBACK_VK_USER_ID);
          setVkReady(true);
        } else {
          setError('Не удалось получить профиль VK');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // История для модели: чередование реплик пользователя и ответов (только поле reply).
  const historyForApi = useCallback(() => {
    return turns.flatMap((t) => [
      { role: 'user', text: t.userText },
      { role: 'assistant', text: t.reply },
    ]);
  }, [turns]);

  const submitUserText = useCallback(
    async (raw) => {
      const userText = String(raw).trim();
      if (!userText || loading) return;
      setLoading(true);
      setError(null);
      setInput('');
      try {
        const history = historyForApi();
        const { echo, corrections, reply } = await practiceApi.postPracticeTurn({
          userText,
          history,
        });
        setTurns((prev) => [
          ...prev,
          { userText, echo, corrections: corrections || null, reply },
        ]);
      } catch (e) {
        setError(e.message || 'Не удалось отправить');
        setInput(userText);
      } finally {
        setLoading(false);
      }
    },
    [loading, historyForApi],
  );

  const sendText = useCallback(() => {
    void submitUserText(input);
  }, [input, submitUserText]);

  const stopRecognition = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        // ignore
      }
      recRef.current = null;
    }
    setListening(false);
  }, []);

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  const startVoice = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || listening || loading) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      if (recRef.current) {
        recRef.current = null;
      }
      setListening(false);
      setError('Не удалось распознать речь. Попробуй ещё раз или набер текст.');
    };
    rec.onresult = (ev) => {
      const text = ev.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        void submitUserText(text);
      }
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setError('Голосовой ввод недоступен');
    }
  }, [listening, loading, submitUserText]);

  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis;
  const speakReply = (text) => {
    if (!canSpeak || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  const voiceAvailable = !!getSpeechRecognition();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => routeNavigator.back()} />}>
        Разговорная практика
      </PanelHeader>

      {!vkReady && !error && (
        <Box style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size="l" />
        </Box>
      )}

      {error && (
        <Group>
          <Box>
            <Text>{error}</Text>
          </Box>
        </Group>
      )}

      {vkReady && (
        <>
          <Group header={<Header mode="secondary">Диалог</Header>}>
            {turns.length === 0 && (
              <Box>
                <Text>Напиши или продиктуй по-английски — собеседник ответит, покажет, что услышал, и при необходимости
                  коротко поправит формулировки.</Text>
              </Box>
            )}
            {turns.map((t, i) => (
              <Box key={i} style={{ marginBottom: 16 }}>
                <Text weight="2">Ты</Text>
                <Text style={{ marginTop: 4 }}>{t.userText}</Text>
                <Separator style={{ margin: '10px 0' }} />
                <Text weight="2">Как услышано</Text>
                <Text style={{ marginTop: 4 }}>{t.echo}</Text>
                {t.corrections && (
                  <>
                    <Separator style={{ margin: '10px 0' }} />
                    <Text weight="2">Правки</Text>
                    <Text style={{ marginTop: 4 }}>{t.corrections}</Text>
                  </>
                )}
                <Separator style={{ margin: '10px 0' }} />
                <Text weight="2">Собеседник</Text>
                <Text style={{ marginTop: 4, lineHeight: 1.45 }}>{t.reply}</Text>
                <Button
                  size="m"
                  mode="tertiary"
                  style={{ marginTop: 8 }}
                  disabled={!canSpeak}
                  onClick={() => speakReply(t.reply)}
                >
                  Прослушать ответ
                </Button>
              </Box>
            ))}
            {loading && (
              <Box style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spinner />
              </Box>
            )}
          </Group>

          <Group header={<Header mode="secondary">Твоя реплика</Header>}>
            <FormItem top="По-английски">
              <Textarea
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type here..."
                disabled={loading || listening}
              />
            </FormItem>
            <FormItem>
              <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button size="l" stretched loading={loading} disabled={!input.trim() || loading} onClick={sendText}>
                  Ответить
                </Button>
                <Button
                  size="l"
                  stretched
                  mode="secondary"
                  loading={listening}
                  disabled={loading || listening || !voiceAvailable}
                  onClick={listening ? stopRecognition : startVoice}
                >
                  {listening ? 'Слушаю…' : 'Говорить'}
                </Button>
                {!voiceAvailable && (
                  <Footnote>Голосовой ввод в этом браузере недоступен — пользуйся клавиатурой.</Footnote>
                )}
              </Box>
            </FormItem>
          </Group>
        </>
      )}
    </Panel>
  );
};

Practice.propTypes = {
  id: PropTypes.string.isRequired,
};
