import { Panel, PanelHeader, PanelHeaderBack, Placeholder } from '@vkontakte/vkui';
import PropTypes from 'prop-types';
import PersikImage from '../assets/persik.png';

import { useNavigateBackOrHome } from '../utils/useNavigateBackOrHome.js';

export const Persik = ({ id }) => {
  const goBackOrHome = useNavigateBackOrHome();

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => void goBackOrHome()} />}>Persik</PanelHeader>
      <Placeholder>
        <img width={230} src={PersikImage} alt="Persik The Cat" />
      </Placeholder>
    </Panel>
  );
};

Persik.propTypes = {
  id: PropTypes.string.isRequired,
};
