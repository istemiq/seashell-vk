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
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import * as api from '../api/dictionaryApi.js';
import { getVkUserIdFromLocation } from '../utils/vkUserId.js';
import { withTimeout } from '../utils/withTimeout.js';
import { loadSettings } from '../utils/settings.js';
import { speakEnglish } from '../utils/tts.js';

const BRIDGE_GET_USER_MS = 8000;
const DEV_FALLBACK_VK_USER_ID = Number(import.meta.env.VITE_DEV_VK_USER_ID) || 1000001;

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
  const [screen, setScreen] = useState('dictionary'); // 'dictionary' | 'groups' | 'group'
  const [activeSetId, setActiveSetId] = useState(null); // number | null
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
        screen === 'group' && Number.isFinite(activeSetId) && activeSetId > 0
          ? await api.fetchWordsInSet(activeSetId)
          : await api.fetchWords();
      setWords(data.words || []);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [vkUserId, screen, activeSetId]);

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
      setError(e.message || 'Ошибка загрузки групп');
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
      const created = await api.addWord(w);
      // Если мы внутри группы — сразу назначаем новое слово в эту группу.
      if (screen === 'group' && Number.isFinite(activeSetId) && activeSetId > 0 && created?.id) {
        try {
          await api.updateWordSets(created.id, [activeSetId]);
        } catch {
          // не блокируем добавление слова, если назначение группы не удалось
        }
      }
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
  const activeSetName =
    screen === 'group' && Number.isFinite(activeSetId)
      ? sets.find((s) => Number(s.id) === Number(activeSetId))?.name ?? 'Группа'
      : null;

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
      setError(e.message || 'Не удалось создать группу');
    } finally {
      setCreatingSet(false);
    }
  };

  const doRenameSet = async (sid) => {
    const cur = sets.find((s) => Number(s.id) === Number(sid));
    const next = window.prompt('Новое название группы', cur?.name ?? '');
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
        'Группа будет удалена. Слова, которые останутся без групп, тоже будут удалены. Продолжить?',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const r = await api.deleteSet(sid);
      const removedWordIds = Array.isArray(r?.removedWordIds) ? r.removedWordIds : [];
      if (screen === 'group' && Number(activeSetId) === Number(sid)) {
        setScreen('dictionary');
        setActiveSetId(null);
      }
      if (selectedId && removedWordIds.some((x) => Number(x) === Number(selectedId))) {
        closeWord();
      }
      await loadSets();
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось удалить группу');
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
      setError(e.message || 'Не удалось сохранить группы');
    }
  };

  const onBack = () => {
    if (selectedId) return closeWord();
    if (screen === 'group') {
      setScreen('groups');
      return;
    }
    if (screen === 'groups') {
      setScreen('dictionary');
      return;
    }
    routeNavigator.back();
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>
        {selectedId ? headerTitle : screen === 'group' ? activeSetName : 'Словарь'}
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
          {screen === 'dictionary' && (
            <Group header={<Header mode="secondary">Группы</Header>}>
              <FormItem>
                <Button
                  type="button"
                  size="l"
                  stretched
                  disabled={setsLoading}
                  onClick={() => setScreen('groups')}
                >
                  Мои группы
                </Button>
                <Footnote style={{ marginTop: 8 }}>
                  Группа — это «подсловарь». Например: «Кухня», «Бизнес». Внутри группы показываются только её слова.
                </Footnote>
              </FormItem>
            </Group>
          )}

          {screen === 'groups' && (
            <Group header={<Header mode="secondary">Мои группы</Header>}>
              <FormItem top="Новая группа">
                <Input
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="например: Кухня"
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
                  Создать группу
                </Button>
              </FormItem>

              {setsLoading && (
                <Box style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <Spinner />
                </Box>
              )}

              {!setsLoading && sets.length === 0 && (
                <Box>
                  <Text>Групп пока нет — создай первую выше.</Text>
                </Box>
              )}

              {!setsLoading &&
                sets.map((s) => (
                  <Cell
                    key={s.id}
                    onClick={() => {
                      setActiveSetId(Number(s.id));
                      setScreen('group');
                      setEditingWordSets(false);
                    }}
                    subtitle="Открыть группу"
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
            </Group>
          )}

          {(screen === 'dictionary' || screen === 'group') && (
            <Group header={<Header mode="secondary">{screen === 'group' ? 'Новое слово в группе' : 'Новое слово'}</Header>}>
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
                {screen === 'group'
                  ? 'Слово добавится в эту группу. Примеры и переводы подберём автоматически.'
                  : 'Подберём примеры и переводы автоматически. «Другой пример» переключает сохранённые карточки.'}
              </Footnote>
            </FormItem>
            </Group>
          )}

          {(screen === 'dictionary' || screen === 'group') && (
            <Group header={<Header mode="secondary">{screen === 'group' ? 'Слова группы' : 'Мои слова'}</Header>}>
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
          )}
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
                <Text weight="2">Группы</Text>
                {selectedSetNames.length ? (
                  <Text style={{ marginTop: 6, lineHeight: 1.45 }}>{selectedSetNames.join(', ')}</Text>
                ) : (
                  <Footnote style={{ marginTop: 6 }}>Пока без групп.</Footnote>
                )}

                <Box style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    mode="secondary"
                    size="m"
                    disabled={setsLoading}
                    onClick={() => setEditingWordSets((v) => !v)}
                  >
                    {editingWordSets ? 'Скрыть' : 'Изменить группы'}
                  </Button>
                  <Button type="button" mode="tertiary" size="m" disabled={setsLoading} onClick={loadSets}>
                    Обновить список групп
                  </Button>
                </Box>

                {editingWordSets && (
                  <Box style={{ marginTop: 12 }}>
                    {sets.length === 0 ? (
                      <Footnote>Сначала создай хотя бы одну группу (в списке слов, кнопка «Управлять группами»).</Footnote>
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
                          Сохранить группы
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
                  onClick={() => {
                    void speakEnglish(currentExampleText).catch((e) => {
                      setError(e?.message || 'Озвучка недоступна');
                    });
                  }}
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
