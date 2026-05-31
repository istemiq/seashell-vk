/**
 * Политика конфиденциальности внутри мини-приложения (без увода во внешний браузер).
 */
import { Panel, PanelHeader, PanelHeaderBack, Group, Header, Text } from '@vkontakte/vkui';
import PropTypes from 'prop-types';
import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
} from '../content/privacyPolicyRu.js';

export const Privacy = ({ id }) => {
  const goBackOrHome = useNavigateBackOrHome();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBackOrHome} />}>
        Политика конфиденциальности
      </PanelHeader>

      <Group>
        <Text weight="2" style={{ lineHeight: 1.45 }}>
          {PRIVACY_POLICY_TITLE}
        </Text>
        <Text style={{ lineHeight: 1.55, marginTop: 8, color: 'var(--vkui--color_text_secondary)' }}>
          {PRIVACY_POLICY_INTRO}
        </Text>
      </Group>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <Group key={section.title} header={<Header mode="secondary">{section.title}</Header>}>
          {section.body?.map((paragraph) => (
            <Text key={paragraph.slice(0, 40)} style={{ lineHeight: 1.55, marginBottom: 8 }}>
              {paragraph}
            </Text>
          ))}
          {section.list ? (
            <ul style={{ lineHeight: 1.55, margin: '0 0 8px', paddingLeft: 18 }}>
              {section.list.map((item) => (
                <li key={item.slice(0, 40)} style={{ marginBottom: 6 }}>
                  <Text style={{ lineHeight: 1.55 }}>{item}</Text>
                </li>
              ))}
            </ul>
          ) : null}
        </Group>
      ))}
    </Panel>
  );
};

Privacy.propTypes = {
  id: PropTypes.string.isRequired,
};
