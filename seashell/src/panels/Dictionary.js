/**
 * Панель «Словарь»: список слов, добавление с генерацией примеров через GigaChat, карусель примеров с переводом.
 * См. `dictionaryApi.js` и `server/db.js` (PostgreSQL).
 */
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
  FormItem,
  Box,
  Spinner,
  Footnote,
  Text,
  Separator,
  Checkbox,
  Select,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import * as api from '../api/dictionaryApi.js';
import { getVkUserIdFromLocation } from '../utils/vkUserId.js';
import { withTimeout } from '../utils/withTimeout.js';
import { loadSettings } from '../utils/settings.js';

const BRIDGE_GET_USER_MS = 8000;
const DEV_FALLBACK_VK_USER_ID = Number(import.meta.env.VITE_DEV_VK_USER_ID) || 1000001;

function speakEnglish(text) {
  const s = loadSettings();
  if (!s.ttsEnabled) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = Number(s.ttsRate) || 0.95;
  window.speechSynthesis.speak(u);
}

/** Достаёт строку из поля примера (старый баг мог сохранить «[object Object]»). */
function lineFromExampleField(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '[object Object]') return '';
    return s;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const nested =
      val.text ??
      val.en ??
      val.english ??
      val.sentence ??
      val.example ??
      val.phrase ??
      val.translation ??
      val.ru;
    if (nested !== undefined && nested !== val) return lineFromExampleField(nested);
  }
  return '';
}

export const Dictionary = ({ id }) => {
  const routeNavigator = useRouteNavigator();
  const [vkUserId, setVkUserId] = useState(() => getVkUserIdFromLocation());
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [activeSetId, setActiveSetId] = useState('all'); // 'all' | number
  const [manageSetsOpen, setManageSetsOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [creatingSet, setCreatingSet] = useState(false);

  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [editingWordSets, setEditingWordSets] = useState(false);
  const [pendingSetIds, setPendingSetIds] = useState([]);

  // Fallback vk_user_id для API вне VK WebView.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getVkUserIdFromLocation()) {
        return;
      }
      try {
        const u = await withTimeout(bridge.send('VKWebAppGetUserInfo'), BRIDGE_GET_USER_MS);
        if (cancelled || !u?.id) return;
        api.setVkUserIdFallback(u.id);
        setVkUserId((prev) => prev ?? u.id);
      } catch {
        if (cancelled) return;
        if (!bridge.isWebView()) {
          api.setVkUserIdFallback(DEV_FALLBACK_VK_USER_ID);
          setVkUserId(DEV_FALLBACK_VK_USER_ID);
        } else {
          setError('Не удалось получить профиль VK');
        }
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
      const data =
        activeSetId === 'all'
          ? await api.fetchWords()
          : await api.fetchWordsInSet(activeSetId);
      setWords(data.words || []);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [vkUserId, activeSetId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadSets = useCallback(async () => {
    if (!vkUserId) return;
    setSetsLoading(true);
    try {
      const data = await api.fetchSets();
      setSets(Array.isArray(data.sets) ? data.sets : []);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки сетов');
    } finally {
      setSetsLoading(false);
    }
  }, [vkUserId]);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const openWord = async (wordId) => {
    if (!vkUserId) return;
    setSelectedId(wordId);
    setDetailLoading(true);
    setExampleIdx(0);
    setEditingWordSets(false);
    setError(null);
    try {
      const d = await api.fetchWord(wordId);
      setDetail(d);
      setPendingSetIds(Array.isArray(d?.setIds) ? d.setIds : []);
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
    setEditingWordSets(false);
    setPendingSetIds([]);
  };

  const addWord = async () => {
    const w = newWord.trim();
    if (!w || !vkUserId) return;
    setAdding(true);
    setError(null);
    try {
      await api.addWord(w);
      setNewWord('');
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось добавить');
    } finally {
      setAdding(false);
    }
  };

  const refreshExamples = async () => {
    if (!selectedId || !vkUserId) return;
    setRefreshing(true);
    setError(null);
    try {
      const d = await api.refreshWordExamples(selectedId);
      setDetail(d);
      setExampleIdx(0);
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось обновить примеры');
    } finally {
      setRefreshing(false);
    }
  };

  const removeWord = async (wordId, e) => {
    e?.stopPropagation?.();
    if (!vkUserId || !window.confirm('Удалить слово и все примеры?')) return;
    try {
      await api.removeWord(wordId);
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

  const ex = detail?.examples?.[exampleIdx];
  const currentExampleText = lineFromExampleField(ex?.text);
  const currentExampleRu = lineFromExampleField(ex?.translation);

  const headerTitle = selectedId ? (detail?.word || '…') : 'Словарь';

  const setNameById = useCallback(
    (sid) => sets.find((s) => Number(s.id) === Number(sid))?.name ?? null,
    [sets],
  );

  const selectedSetNames =
    Array.isArray(detail?.setIds) && detail.setIds.length
      ? detail.setIds.map((sid) => setNameById(sid)).filter(Boolean)
      : [];

  const createNewSet = async () => {
    const name = newSetName.trim().replace(/\s+/g, ' ');
    if (!name || !vkUserId) return;
    setCreatingSet(true);
    setError(null);
    try {
      await api.createSet(name);
      setNewSetName('');
      await loadSets();
    } catch (e) {
      setError(e.message || 'Не удалось создать сет');
    } finally {
      setCreatingSet(false);
    }
  };

  const doRenameSet = async (sid) => {
    const cur = sets.find((s) => Number(s.id) === Number(sid));
    const next = window.prompt('Новое название сета', cur?.name ?? '');
    if (next == null) return;
    const name = String(next).trim().replace(/\s+/g, ' ');
    if (!name) return;
    setError(null);
    try {
      await api.renameSet(sid, name);
      await loadSets();
    } catch (e) {
      setError(e.message || 'Не удалось переименовать');
    }
  };

  const doDeleteSet = async (sid) => {
    if (
      !window.confirm(
        'Сет будет удалён. Слова, которые останутся без сетов, тоже будут удалены. Продолжить?',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const r = await api.deleteSet(sid);
      const removedWordIds = Array.isArray(r?.removedWordIds) ? r.removedWordIds : [];
      if (activeSetId !== 'all' && Number(activeSetId) === Number(sid)) {
        setActiveSetId('all');
      }
      if (selectedId && removedWordIds.some((x) => Number(x) === Number(selectedId))) {
        closeWord();
      }
      await loadSets();
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось удалить сет');
    }
  };

  const togglePendingSet = (sid) => {
    const n = Number(sid);
    setPendingSetIds((prev) =>
      prev.some((x) => Number(x) === n) ? prev.filter((x) => Number(x) !== n) : [...prev, n],
    );
  };

  const saveWordSets = async () => {
    if (!selectedId || !vkUserId) return;
    setError(null);
    try {
      const r = await api.updateWordSets(selectedId, pendingSetIds);
      const out = Array.isArray(r?.setIds) ? r.setIds : pendingSetIds;
      setDetail((prev) => (prev ? { ...prev, setIds: out } : prev));
      setEditingWordSets(false);
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось сохранить сеты');
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => (selectedId ? closeWord() : routeNavigator.back())} />}>
        {headerTitle}
      </PanelHeader>

      {!vkUserId && !error && (
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

      {/* Список слов и форма добавления */}
      {!selectedId && vkUserId && (
        <>
          <Group
            header={
              <Header
                mode="secondary"
                aside={
                  <Button
                    type="button"
                    mode="tertiary"
                    size="s"
                    disabled={setsLoading}
                    onClick={() => setManageSetsOpen((v) => !v)}
                  >
                    {manageSetsOpen ? 'Скрыть' : 'Управлять'}
                  </Button>
                }
              >
                Сеты
              </Header>
            }
          >
            <FormItem top="Фильтр слов">
              <Select
                value={String(activeSetId)}
                onChange={(e) => {
                  const v = String(e.target.value);
                  setActiveSetId(v === 'all' ? 'all' : parseInt(v, 10));
                }}
                options={[
                  { label: 'Все слова', value: 'all' },
                  ...sets.map((s) => ({ label: s.name, value: String(s.id) })),
                ]}
              />
            </FormItem>

            {manageSetsOpen && (
              <>
                <Separator style={{ margin: '12px 0' }} />
                <FormItem top="Новый сет">
                  <Input
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder="например: Еда, Путешествия…"
                    disabled={creatingSet}
                  />
                </FormItem>
                <FormItem>
                  <Button
                    type="button"
                    size="l"
                    stretched
                    loading={creatingSet}
                    disabled={!newSetName.trim()}
                    onClick={createNewSet}
                  >
                    Создать сет
                  </Button>
                  <Footnote style={{ marginTop: 8 }}>
                    Можно назначать слово в несколько сетов. При удалении сета слова без сетов удалятся.
                  </Footnote>
                </FormItem>

                {setsLoading && (
                  <Box style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                    <Spinner />
                  </Box>
                )}

                {!setsLoading && sets.length === 0 && (
                  <Box>
                    <Text>Сетов пока нет — создай первый выше.</Text>
                  </Box>
                )}

                {!setsLoading &&
                  sets.map((s) => (
                    <Cell
                      key={s.id}
                      subtitle="Управление сетом"
                      after={
                        <Box style={{ display: 'flex', gap: 8 }}>
                          <Button type="button" mode="tertiary" size="s" onClick={() => doRenameSet(s.id)}>
                            Переименовать
                          </Button>
                          <Button type="button" mode="tertiary" size="s" onClick={() => doDeleteSet(s.id)}>
                            Удалить
                          </Button>
                        </Box>
                      }
                    >
                      {s.name}
                    </Cell>
                  ))}
              </>
            )}
          </Group>

          <Group header={<Header mode="secondary">Новое слово</Header>}>
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
                type="button"
                size="l"
                stretched
                loading={adding}
                disabled={!newWord.trim()}
                onClick={addWord}
              >
                Добавить слово
              </Button>
              <Footnote style={{ marginTop: 8 }}>
                Подберём примеры и переводы автоматически. «Другой пример» переключает сохранённые карточки.
              </Footnote>
            </FormItem>
          </Group>

          <Group header={<Header mode="secondary">Мои слова</Header>}>
            {loading && (
              <Box style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spinner />
              </Box>
            )}
            {!loading && words.length === 0 && (
              <Box>
                <Text>Пока пусто — добавь первое слово выше.</Text>
              </Box>
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

      {/* Карточка слова: значение, примеры, озвучка */}
      {selectedId && (
        <Group>
          {detailLoading && (
            <Box style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spinner size="l" />
            </Box>
          )}
          {!detailLoading && detail && (
            <>
              <Box style={{ marginBottom: 12 }}>
                <Text weight="2">Сеты</Text>
                {selectedSetNames.length ? (
                  <Text style={{ marginTop: 6, lineHeight: 1.45 }}>{selectedSetNames.join(', ')}</Text>
                ) : (
                  <Footnote style={{ marginTop: 6 }}>Пока без сетов.</Footnote>
                )}

                <Box style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    mode="secondary"
                    size="m"
                    disabled={setsLoading || sets.length === 0}
                    onClick={() => setEditingWordSets((v) => !v)}
                  >
                    {editingWordSets ? 'Скрыть' : 'Изменить сеты'}
                  </Button>
                  <Button type="button" mode="tertiary" size="m" disabled={setsLoading} onClick={loadSets}>
                    Обновить список сетов
                  </Button>
                </Box>

                {editingWordSets && (
                  <Box style={{ marginTop: 12 }}>
                    {sets.length === 0 ? (
                      <Footnote>Сначала создай хотя бы один сет (в списке слов).</Footnote>
                    ) : (
                      <>
                        {sets.map((s) => (
                          <Checkbox
                            key={s.id}
                            checked={pendingSetIds.some((x) => Number(x) === Number(s.id))}
                            onChange={() => togglePendingSet(s.id)}
                          >
                            {s.name}
                          </Checkbox>
                        ))}
                        <Button
                          size="l"
                          stretched
                          style={{ marginTop: 12 }}
                          disabled={refreshing}
                          onClick={saveWordSets}
                        >
                          Сохранить сеты
                        </Button>
                      </>
                    )}
                  </Box>
                )}
                <Separator style={{ margin: '12px 0' }} />
              </Box>

              <Box>
                <Text weight="2">Значение слова</Text>
                {detail.gloss_ru ? (
                  <Text style={{ marginTop: 6, lineHeight: 1.45 }}>{detail.gloss_ru}</Text>
                ) : (
                  <Footnote style={{ marginTop: 6 }}>
                    Краткого перевода пока нет — нажми «Обновить примеры» ниже.
                  </Footnote>
                )}
                <Separator style={{ margin: '12px 0' }} />
                <Text weight="2">Пример {exampleIdx + 1} из {detail.examples.length}</Text>
                <Separator style={{ margin: '12px 0' }} />
                {currentExampleText ? (
                  <>
                    <Text style={{ lineHeight: 1.45 }}>{currentExampleText}</Text>
                    {currentExampleRu ? (
                      <Text style={{ marginTop: 12, lineHeight: 1.45, opacity: 0.88 }}>{currentExampleRu}</Text>
                    ) : (
                      <Footnote style={{ marginTop: 10 }}>Перевода этой карточки нет.</Footnote>
                    )}
                  </>
                ) : (
                  <Footnote>
                    Не удалось показать пример. Нажми «Обновить примеры» или удали слово и добавь снова.
                  </Footnote>
                )}
              </Box>
              <Box style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <Button
                  size="l"
                  stretched
                  loading={refreshing}
                  disabled={refreshing}
                  mode="secondary"
                  onClick={refreshExamples}
                >
                  Обновить примеры
                </Button>
                <Button
                  size="l"
                  stretched
                  disabled={!currentExampleText || refreshing}
                  onClick={() => speakEnglish(currentExampleText)}
                >
                  Прослушать
                </Button>
                <Button size="l" stretched mode="secondary" disabled={refreshing} onClick={nextExample}>
                  Другой пример
                </Button>
              </Box>
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
