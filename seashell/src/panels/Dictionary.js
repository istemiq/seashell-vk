import { useCallback, useEffect, useState } from 'react';
import bridge from '@vkontakte/vk-bridge';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Cell,
  Button,
  Input,
  FormLayout,
  FormItem,
  Div,
  Spinner,
  Footnote,
  Text,
  Separator,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import * as api from '../api/dictionaryApi.js';

function speakEnglish(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export const Dictionary = ({ id }) => {
  const routeNavigator = useRouteNavigator();
  const [vkUserId, setVkUserId] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await bridge.send('VKWebAppGetUserInfo');
        if (!cancelled && u?.id) setVkUserId(u.id);
      } catch {
        if (!cancelled) setError('Не удалось получить профиль VK');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!vkUserId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchWords(vkUserId);
      setWords(data.words || []);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [vkUserId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openWord = async (wordId) => {
    if (!vkUserId) return;
    setSelectedId(wordId);
    setDetailLoading(true);
    setExampleIdx(0);
    setError(null);
    try {
      const d = await api.fetchWord(vkUserId, wordId);
      setDetail(d);
    } catch (e) {
      setError(e.message || 'Ошибка');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeWord = () => {
    setSelectedId(null);
    setDetail(null);
    setExampleIdx(0);
  };

  const addWord = async () => {
    const w = newWord.trim();
    if (!w || !vkUserId) return;
    setAdding(true);
    setError(null);
    try {
      await api.addWord(vkUserId, w);
      setNewWord('');
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось добавить');
    } finally {
      setAdding(false);
    }
  };

  const removeWord = async (wordId, e) => {
    e?.stopPropagation?.();
    if (!vkUserId || !window.confirm('Удалить слово и все примеры?')) return;
    try {
      await api.removeWord(vkUserId, wordId);
      if (selectedId === wordId) closeWord();
      await loadList();
    } catch (err) {
      setError(err.message || 'Ошибка удаления');
    }
  };

  const nextExample = () => {
    if (!detail?.examples?.length) return;
    setExampleIdx((i) => (i + 1) % detail.examples.length);
  };

  const currentExampleText = detail?.examples?.[exampleIdx]?.text || '';

  const headerTitle = selectedId ? (detail?.word || '…') : 'Словарь';

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => (selectedId ? closeWord() : routeNavigator.back())} />}>
        {headerTitle}
      </PanelHeader>

      {!vkUserId && !error && (
        <Div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size="l" />
        </Div>
      )}

      {error && (
        <Group>
          <Div>
            <Text>{error}</Text>
          </Div>
        </Group>
      )}

      {!selectedId && vkUserId && (
        <>
          <Group header={<Header mode="secondary">Новое слово</Header>}>
            <FormLayout>
              <FormItem top="Английское слово или фраза">
                <Input
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="например: matter"
                  disabled={adding}
                />
              </FormItem>
              <FormItem>
                <Button
                  size="l"
                  stretched
                  loading={adding}
                  disabled={adding || !newWord.trim()}
                  onClick={addWord}
                >
                  Добавить и сгенерировать 15 примеров
                </Button>
                <Footnote style={{ marginTop: 8 }}>
                  Примеры создаёт GigaChat один раз и сохраняются в базе. «Другой пример» переключает без новых запросов к
                  модели.
                </Footnote>
              </FormItem>
            </FormLayout>
          </Group>

          <Group header={<Header mode="secondary">Мои слова</Header>}>
            {loading && (
              <Div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spinner />
              </Div>
            )}
            {!loading && words.length === 0 && (
              <Div>
                <Text>Пока пусто — добавь первое слово выше.</Text>
              </Div>
            )}
            {!loading &&
              words.map((w) => (
                <Cell
                  key={w.id}
                  onClick={() => openWord(w.id)}
                  subtitle={`Примеров: ${w.example_count ?? 0}`}
                  after={
                    <Button
                      type="button"
                      mode="tertiary"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWord(w.id, e);
                      }}
                    >
                      Удалить
                    </Button>
                  }
                >
                  {w.word}
                </Cell>
              ))}
          </Group>
        </>
      )}

      {selectedId && (
        <Group>
          {detailLoading && (
            <Div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spinner size="l" />
            </Div>
          )}
          {!detailLoading && detail && (
            <>
              <Div>
                <Text weight="2">Пример {exampleIdx + 1} из {detail.examples.length}</Text>
                <Separator style={{ margin: '12px 0' }} />
                <Text style={{ lineHeight: 1.45 }}>{currentExampleText}</Text>
              </Div>
              <Div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <Button size="l" stretched onClick={() => speakEnglish(currentExampleText)}>
                  Озвучить (браузер, бесплатно)
                </Button>
                <Button size="l" stretched mode="secondary" onClick={nextExample}>
                  Другой пример
                </Button>
              </Div>
              <Footnote style={{ marginTop: 12 }}>
                Озвучка — Web Speech API в устройстве; для продакшена позже можно подключить облачный TTS.
              </Footnote>
            </>
          )}
        </Group>
      )}
    </Panel>
  );
};

Dictionary.propTypes = {
  id: PropTypes.string.isRequired,
};
