import './PantallaInicio.css';
import { useState } from 'react';
import FooterComuna from './FooterComuna';

function PantallaInicio({ onEnter }) {
  const [isOpening, setIsOpening] = useState(false);

  const handleClick = () => {
    setIsOpening(true);
    setTimeout(() => {
      onEnter();
    }, 500);
  };

  return (
    <div className="pantalla-inicio-page">
      <div className={`hero-container ${isOpening ? 'opening' : ''}`}>
        {/* Fondo con gradiente elegante */}
        <div className="background-gradient" />

        {/* Elementos decorativos flotantes */}
        <div className="floating-elements">
          <div className="element element-1" />
          <div className="element element-2" />
          <div className="element element-3" />
        </div>

        {/* Contenido principal */}
        <div className="hero-content">
          {/* Línea decorativa */}
          <div className="divider" />

          {/* Título principal */}
          <h1 className="main-title">
            Evento<br />
            <span className="highlight">Día del Niño</span>
          </h1>

          {/* Subtítulo */}
          <p className="subtitle">
            Acompáñanos en esta celebración especial
          </p>

          {/* Botón de ingreso */}
          <button className="enter-button" onClick={handleClick}>
            <span className="button-text">Ingresar</span>
          </button>
        </div>

        {/* Elemento decorativo inferior */}
        <div className="footer-decoration" />
      </div>

      <FooterComuna />
    </div>
  );
}

export default PantallaInicio;
