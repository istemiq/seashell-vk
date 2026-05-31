/**
 * Панель «Словарь»: список слов, добавление с генерацией примеров через GigaChat, карусель примеров с переводом.
 * См. `dictionaryApi.js` и `server/db.js` (PostgreSQL).
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  ModalDismissButton,
} from '@vkontakte/vkui';
import PropTypes from 'prop-types';

import * as api from '../api/dictionaryApi.js';
import { getVkUserIdFromLocation } from '../utils/vkUserId.js';
import { withTimeout } from '../utils/withTimeout.js';
import { speakEnglish } from '../utils/tts.js';
import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';
import { SplitModalSlotContext } from '../context/SplitModalSlotContext.js';

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

/** Слой в history для «назад» с карточки слова в список, без ухода с раздела */
const HISTORY_WORD_DETAIL = { seashellDictWord: 1 };

export const Dictionary = ({ id }) => {
  const splitModalMount = useContext(SplitModalSlotContext);
  const goBackOrHome = useNavigateBackOrHome();
  const wordDetailHistoryRef = useRef(false);
  const [vkUserId, setVkUserId] = useState(() => api.resolveVkUserId());
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
  const [wordSetsModalOpen, setWordSetsModalOpen] = useState(false);
  const [modalNewSetName, setModalNewSetName] = useState('');
  const [creatingSetInModal, setCreatingSetInModal] = useState(false);
  const [pendingSetIds, setPendingSetIds] = useState([]);

  useEffect(() => {
    const onPopState = () => {
      if (!wordDetailHistoryRef.current) return;
      wordDetailHistoryRef.current = false;
      setSelectedId(null);
      setDetail(null);
      setExampleIdx(0);
      setWordSetsModalOpen(false);
      setModalNewSetName('');
      setPendingSetIds([]);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Fallback vk_user_id для API вне VK WebView.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromUrl = getVkUserIdFromLocation();
      if (fromUrl) {
        setVkUserId((prev) => prev ?? fromUrl);
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
          setError('Не удалось получить профиль VK. Закройте мини-приложение и откройте снова из меню VK.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!vkUserId) {
      setLoading(false);
      return;
    }
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
    setWordSetsModalOpen(false);
    setModalNewSetName('');
    setError(null);
    try {
      const d = await api.fetchWord(wordId);
      setDetail(d);
      setPendingSetIds(Array.isArray(d?.setIds) ? d.setIds : []);
      if (typeof window !== 'undefined') {
        window.history.pushState(HISTORY_WORD_DETAIL, '', window.location.href);
        wordDetailHistoryRef.current = true;
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeWord = () => {
    const hadHistoryLayer = wordDetailHistoryRef.current;
    wordDetailHistoryRef.current = false;
    setSelectedId(null);
    setDetail(null);
    setExampleIdx(0);
    setWordSetsModalOpen(false);
    setModalNewSetName('');
    setPendingSetIds([]);
    if (hadHistoryLayer && typeof window !== 'undefined') {
      window.history.back();
    }
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
      // Остаёмся в списке слов; карточку открываем только по тапу на слово.
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
  // Старые карточки с колонкой note_ru — показываем второй строкой.
  const legacyExampleNoteRu = lineFromExampleField(ex?.note_ru);

  const verbUsageRows = Array.isArray(detail?.verb_usage) ? detail.verb_usage : [];
  const showVerbUsage = verbUsageRows.length === 3;

  const headerTitle = selectedId != null ? (detail?.word || '…') : 'Словарь';
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

  const closeWordSetsModalDiscard = useCallback(() => {
    setWordSetsModalOpen(false);
    setModalNewSetName('');
    setCreatingSetInModal(false);
    setPendingSetIds(Array.isArray(detail?.setIds) ? [...detail.setIds] : []);
  }, [detail?.setIds]);

  const openWordSetsPicker = useCallback(() => {
    setModalNewSetName('');
    setPendingSetIds(Array.isArray(detail?.setIds) ? [...detail.setIds] : []);
    void loadSets();
    setWordSetsModalOpen(true);
  }, [detail?.setIds, loadSets]);

  useEffect(() => {
    if (!wordSetsModalOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeWordSetsModalDiscard();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [wordSetsModalOpen, closeWordSetsModalDiscard]);

  const createSetFromModal = async () => {
    const name = modalNewSetName.trim().replace(/\s+/g, ' ');
    if (!name || !vkUserId) return;
    setCreatingSetInModal(true);
    setError(null);
    try {
      const created = await api.createSet(name);
      setModalNewSetName('');
      await loadSets();
      const newId = created?.id != null ? Number(created.id) : NaN;
      if (Number.isFinite(newId) && newId > 0) {
        setPendingSetIds((prev) => (prev.some((x) => Number(x) === newId) ? prev : [...prev, newId]));
      }
    } catch (e) {
      setError(e.message || 'Не удалось создать группу');
    } finally {
      setCreatingSetInModal(false);
    }
  };

  const saveWordSets = async () => {
    if (selectedId == null || !vkUserId) return;
    setError(null);
    try {
      const r = await api.updateWordSets(selectedId, pendingSetIds);
      const out = Array.isArray(r?.setIds) ? r.setIds : pendingSetIds;
      setDetail((prev) => (prev ? { ...prev, setIds: out } : prev));
      setWordSetsModalOpen(false);
      setModalNewSetName('');
      await loadList();
    } catch (e) {
      setError(e.message || 'Не удалось сохранить группы');
    }
  };

  const onBack = () => {
    if (selectedId != null) {
      if (wordDetailHistoryRef.current) {
        window.history.back();
      } else {
        closeWord();
      }
      return;
    }
    if (screen === 'group') {
      setScreen('groups');
      return;
    }
    if (screen === 'groups') {
      setScreen('dictionary');
      return;
    }
    void goBackOrHome();
  };

  const wordSetsModal =
    splitModalMount != null && wordSetsModalOpen
      ? createPortal(
          <div className="seashell-wordsets-shell seashell-crt">
            <button
              type="button"
              className="seashell-wordsets-shell__backdrop"
              aria-label="Закрыть"
              onClick={closeWordSetsModalDiscard}
            />
            <div
              className="seashell-wordsets-shell__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="seashell-wordsets-title"
            >
              <div className="seashell-wordsets-shell__head">
                <ModalDismissButton onClick={closeWordSetsModalDiscard} />
                <Text weight="2" id="seashell-wordsets-title" className="seashell-wordsets-shell__title">
                  Добавить в группу
                </Text>
              </div>
              <div className="seashell-wordsets-shell__body">
                <Box
                  style={{
                    paddingTop: 12,
                    paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
                    paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
                    boxSizing: 'border-box',
                  }}
                >
                  {setsLoading ? (
                    <Box style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                      <Spinner />
                    </Box>
                  ) : null}

                  {!setsLoading && sets.length === 0 ? (
                    <Footnote>Пока нет групп — создай первую ниже или в разделе «Мои группы».</Footnote>
                  ) : null}

                  {!setsLoading && sets.length > 0 ? (
                    <Box style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sets.map((s) => (
                        <Checkbox
                          key={s.id}
                          checked={pendingSetIds.some((x) => Number(x) === Number(s.id))}
                          onChange={() => togglePendingSet(s.id)}
                        >
                          {s.name}
                        </Checkbox>
                      ))}
                    </Box>
                  ) : null}

                  <Separator style={{ margin: '18px 0' }} />

                  <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Text weight="2" Component="label" htmlFor="seashell-modal-new-set">
                      Новая группа
                    </Text>
                    <Input
                      id="seashell-modal-new-set"
                      value={modalNewSetName}
                      onChange={(e) => setModalNewSetName(e.target.value)}
                      placeholder="например: Кухня"
                      disabled={creatingSetInModal}
                    />
                  </Box>

                  <Box style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button
                      type="button"
                      size="l"
                      stretched
                      loading={creatingSetInModal}
                      disabled={!modalNewSetName.trim() || creatingSetInModal}
                      onClick={() => void createSetFromModal()}
                    >
                      Создать и выбрать
                    </Button>
                    <Button
                      type="button"
                      size="l"
                      stretched
                      disabled={refreshing || setsLoading}
                      onClick={() => void saveWordSets()}
                    >
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      size="l"
                      stretched
                      mode="secondary"
                      disabled={creatingSetInModal}
                      onClick={closeWordSetsModalDiscard}
                    >
                      Отмена
                    </Button>
                  </Box>
                </Box>
              </div>
            </div>
          </div>,
          splitModalMount,
        )
      : null;

  return (
    <Panel id={id}>
      {wordSetsModal}

      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>
        {selectedId != null ? headerTitle : screen === 'group' ? activeSetName : 'Словарь'}
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
      {selectedId == null && vkUserId && (
        <>
          {screen === 'dictionary' && (
            <Group header={<Header mode="secondary">Группы</Header>}>
              <FormItem>
                <Button
                  type="button"
                  size="l"
                  stretched
                  mode="secondary"
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
                      setWordSetsModalOpen(false);
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
            <FormItem top="Слово или фраза (EN или RU)">
              <Input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="например: matter или Мне всё равно"
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
                  ? 'Слово добавится в эту группу. Можно ввести по-русски — в словарь запишем естественный английский эквивалент, примеры и переводы с пометками стиля (нейтр., разг., BrE и т.д.).'
                  : 'Можно ввести по-русски — в словарь запишем естественный английский эквивалент. Подберём примеры и переводы; в конце строки перевода — пометки стиля и BrE/AmE, как в эталоне. «Другой пример» переключает карточки.'}
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
                  {!error && (
                    <Footnote style={{ marginTop: 10, lineHeight: 1.5, opacity: 0.88 }}>
                      Если слова были раньше на другом сервере — в новой базе API их нет; добавь заново или
                      восстанови дамп PostgreSQL на хостинге.
                    </Footnote>
                  )}
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
      {selectedId != null && (
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

                <Footnote style={{ marginTop: 8 }}>
                  Нажми «Добавить в группу», чтобы отметить существующие группы или создать новую.
                </Footnote>
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <Button
                    type="button"
                    mode="secondary"
                    size="l"
                    stretched
                    disabled={setsLoading || detailLoading}
                    onClick={openWordSetsPicker}
                  >
                    Добавить в группу
                  </Button>
                  <Button type="button" mode="tertiary" size="m" disabled={setsLoading} onClick={() => void loadSets()}>
                    Обновить список групп
                  </Button>
                </Box>
                <Separator style={{ margin: '12px 0' }} />
              </Box>

              <Box>
                <Text weight="2">Значение слова</Text>
                {detail.gloss_ru ? (
                  <Text style={{ marginTop: 6, lineHeight: 1.45 }}>{detail.gloss_ru}</Text>
                ) : (
                  <Footnote style={{ marginTop: 6 }}>
                    Похоже, это не слово или редкий неологизм — значение не показываю. Нажми «Обновить примеры», если
                    хочешь ещё попытку.
                  </Footnote>
                )}
                {lineFromExampleField(detail?.gloss_note_ru) ? (
                  <Footnote style={{ marginTop: 10, lineHeight: 1.5, opacity: 0.95 }}>
                    Доп. к головному значению (старая карточка): {lineFromExampleField(detail.gloss_note_ru)}
                  </Footnote>
                ) : null}
                {showVerbUsage ? (
                  <>
                    <Separator style={{ margin: '12px 0' }} />
                    <Text weight="2">Три формы глагола</Text>
                    {verbUsageRows.map((row, i) => {
                      const label = lineFromExampleField(row?.label) || `Форма ${i + 1}`;
                      const en = lineFromExampleField(row?.text);
                      const ru = lineFromExampleField(row?.translation);
                      return (
                        <Box key={`verb-usage-${i}`} style={{ marginTop: i === 0 ? 10 : 14 }}>
                          <Footnote style={{ lineHeight: 1.4, opacity: 0.92 }}>{label}</Footnote>
                          {en ? (
                            <Text style={{ marginTop: 6, lineHeight: 1.45 }}>{en}</Text>
                          ) : null}
                          {ru ? (
                            <Text style={{ marginTop: 6, lineHeight: 1.45, opacity: 0.88 }}>{ru}</Text>
                          ) : null}
                        </Box>
                      );
                    })}
                  </>
                ) : null}
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
                    {legacyExampleNoteRu ? (
                      <Footnote style={{ marginTop: 10, lineHeight: 1.5, opacity: 0.92 }}>
                        Пометка (старая карточка): {legacyExampleNoteRu}
                      </Footnote>
                    ) : null}
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
