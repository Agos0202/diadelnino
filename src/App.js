import { useState, useEffect } from 'react';
import PantallaInicio from './PantallaInicio';
import Administracion from './Administracion';
import Login from './Login';

const RUTA_ADMIN = '/panel_diadelnino';

const obtenerPantallaDesdeRuta = () => {
  if (window.location.pathname.startsWith(RUTA_ADMIN)) {
    return 'administracion';
  }
  return 'inicio';
};

function App() {
  const [pantalla, setPantalla] = useState(obtenerPantallaDesdeRuta);
  const [adminLogueado, setAdminLogueado] = useState(() => {
    return window.localStorage.getItem('adminLogueado') === '1';
  });

  const irAAdministracion = () => {
    window.history.pushState({ pantalla: 'administracion' }, '', RUTA_ADMIN);
    setPantalla('administracion');
  };

  const irAInicio = () => {
    window.history.pushState({ pantalla: 'inicio' }, '', '/');
    setPantalla('inicio');
  };

  useEffect(() => {
    const onPopState = () => {
      setPantalla(obtenerPantallaDesdeRuta());
    };

    window.addEventListener('popstate', onPopState);
    setPantalla(obtenerPantallaDesdeRuta());

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleLogin = () => {
    setAdminLogueado(true);
    window.localStorage.setItem('adminLogueado', '1');
  };

  const handleLogout = () => {
    setAdminLogueado(false);
    window.localStorage.removeItem('adminLogueado');
    irAInicio();
  };

  return (
    <>
      {pantalla === 'administracion' ? (
        adminLogueado ? (
          <Administracion onVolver={irAInicio} onLogout={handleLogout} />
        ) : (
          <Login onLogin={handleLogin} />
        )
      ) : (
        <PantallaInicio onEnter={irAAdministracion} />
      )}
    </>
  );
}

export default App;
