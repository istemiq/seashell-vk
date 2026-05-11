import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Text,
  Button,
  Separator,
  Footnote,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import PropTypes from 'prop-types';

import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';

export const Readme = ({ id }) => {
  const goBackOrHome = useNavigateBackOrHome();
  const routeNavigator = useRouteNavigator();

  const goHome = () => void routeNavigator.replace('/');
  /** Стрелка в шапке использует историю; если её нет во ВК при открытии сразу сюда — сработает переход на «/». */
  const headerBack = () => void goBackOrHome();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={headerBack} />}>Справка</PanelHeader>

      <Group separator="hide" padding="s">
        <Button type="button" mode="secondary" size="m" stretched onClick={goHome}>
          На главную (если стрелка не срабатывает)
        </Button>
      </Group>

      <Separator />

      <Group header={<Header mode="secondary">Что это за приложение</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          <strong>Seashell</strong> — мини-приложение для изучения английского внутри VK: личный словарь со смыслом слова и
          примерами, а также режим живой диалог-практики с короткой обратной связью по вашим фразам. Для работы нужны
          интернет и авторизация через ВКонтакте внутри приложения (ваш аккаунт определяет ваши сохранённые слова).
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Общее</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          Открывайте разделы с <strong>главной страницы</strong> («Словарь», «Разговорная практика», «Настройки» и эта{' '}
          «Справка»). Если при загрузке видите спиннер или сообщение про сеть или сервер — подождите, проверьте интернет или
          зайдите позже (сервер временно может быть недоступен).
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Раздел «Словарь»</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          • <strong>Список слов</strong>: отображаются ваши сохранённые слова и короткая подпись или начало перевода при
          необходимости.
          <br />
          • <strong>Группы</strong>: блок «Группы» содержит кнопку «Мои группы». Группа — это отдельный подсловарь (например,
          «Кухня», «Работа»). В режиме просмотра группы показываются только слова из неё.
          <br />
          • <strong>Добавление слова</strong>: впишите английское слово или фразу и отправьте форму добавления —
          приложение запросит краткое значение и примеры у сервера. Не отправляйте пустые и слишком длинные строки —
          возможна ошибка проверки.
          <br />
          • <strong>Карточка слова</strong>: нажатие по слову открывает детальный экран. Там есть смысл по-русски,{' '}
          <strong>карусель примеров</strong> (можно перелистать), при необходимости действия с озвучкой примера через
          встроенные возможности устройства. Кнопка «Назад» в заголовке возвращает в список (историю навигации внутри
          словаря приложение сохраняет отдельно от других экранов).
          <br />
          • <strong>Добавить в группу</strong>: из карточки слова открывается окно выбора групп галочками, можно создать
          новое имя группы и сохранить. «Отмена» закрывает без сохранения выбора (зависит от реализации).
          <br />
          • Если слово нужно переобучить примерами, в интерфейсе может быть действие про обновление примеров (ограничения
          по частоте со стороны сервера — при спаме появится сообщение про «слишком много запросов»).
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Раздел «Разговорная практика»</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          • Введите фразу на английском в поле и отправьте — придёт короткая реплика «собеседника», при желании блок с тем,
          как фразу услышала система, и возможные точечные правки.
          <br />
          • Если доступна кнопка голосового ввода, это распознавание речи браузера/устройства: разрешите доступ к микрофону,
          когда система попросит. На части сборок клиента VK возможности браузера отличаются — тогда надёжнее печатать
          текстом.
          <br />
          • Контекст диалога по ходу сеанса учитывается (на уровне недавней истории сообщений у сервера). Очищение или
          сброс состояния — через выход из раздела и повторное открытие (если в интерфейсе нет отдельной «Очистить»).
          <br />
          • Запросы к практике лимитируются с сервера во избытке нагрузки — если «слишком часто», придётся подождать минуту
          или две.
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Раздел «Настройки»</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          Откройте «Настройки» для параметров приложения хранящихся на устройстве (если в вашей сборке они есть —
          сохранённые предпочтения и подсказки).
        </Text>
      </Group>

      <Group header={<Header mode="secondary">Как вернуться из «Справки»</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          1) Нажмите <strong>стрелку «Назад»</strong> в левой части шапки (как обычно в VK-приложениях).
          <br />
          2) Если стрелка не реагирует или не показывается в вашей среде, нажмите крупную серую кнопку ниже названия экрана:{' '}
          <strong>«На главную»</strong> — это всегда откроет начальный экран приложения заново по адресу маршрута «/», без обходных
          путей.
        </Text>
      </Group>

      <Separator />

      <Group header={<Header mode="secondary">Для разработчика (деплой на VK Hosting)</Header>}>
        <Text style={{ lineHeight: 1.6 }}>
          После сборки статики нужен токен доступа загрузки (создаётся в кабинете VK для мини-приложения). Из каталога{' '}
          <strong>seashell</strong> после <code style={{ wordBreak: 'break-all' }}>npm run build</code>:
        </Text>
        <Footnote style={{ marginTop: 10 }}>
          PowerShell — задать переменную и вызвать deploy:
          <br />
          <span style={{ display: 'block', marginTop: 6 }}>
            $env:MINI_APPS_ACCESS_TOKEN=&quot;ВАШ_ТОКЕН&quot;
          </span>
          <span style={{ display: 'block', marginTop: 4 }}>npm run deploy</span>
        </Footnote>
        <Footnote style={{ marginTop: 12 }}>
          Пользователям приложения эти строки выполнять не нужно — только автору сборки сайта Seashell во ВКонтакте.
        </Footnote>
      </Group>

      <Group separator="hide" padding="s">
        <Button type="button" mode="secondary" size="m" stretched onClick={goHome}>
          На главную
        </Button>
      </Group>
    </Panel>
  );
};

Readme.propTypes = {
  id: PropTypes.string.isRequired,
};
