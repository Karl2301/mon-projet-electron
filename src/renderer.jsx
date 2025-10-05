import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';

const App = () => {
  const [folder, setFolder] = useState(null);
  const [fileName, setFileName] = useState('example.txt');
  const [content, setContent] = useState('Contenu initial');
  const [status, setStatus] = useState('');
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const tryLoadTokens = async () => {
      const stored = await window.electronAPI.loadTokens();
      if (stored?.refresh_token) {
        // Rafraîchir le token si pas d'access_token ou expiré
        const newTokens = await window.electronAPI.refreshToken(stored.refresh_token);
        setTokens(newTokens);
        setStatus('Authentifié automatiquement.');
      } else if (stored?.access_token) {
        setTokens(stored);
        setStatus('Authentifié (token existant).');
      }
    };
    tryLoadTokens();
  }, []);

  const chooseFolder = async () => {
    const result = await window.electronAPI.selectFolder();
    setFolder(result);
  };

  const startAuth = async () => {
    setStatus('Requesting device code...');
    try {
      const device = await window.electronAPI.startDeviceFlow();
      setDeviceInfo(device);
      setStatus('Veuillez visiter le lien et saisir le code affiché pour vous authentifier.');
      // start polling every 5 seconds
      const interval = setInterval(async () => {
        const pol = await window.electronAPI.pollToken({ device_code: device.device_code });
        if (pol.ok) {
          clearInterval(interval);
          setTokens(pol.data);
          setStatus('Authentification réussie.');
        } else {
          // continue until success or expired
          console.log('poll:', pol.data);
        }
      }, (device.interval || 5) * 1000);
    } catch (err) {
      setStatus('Erreur d\u00e9marche auth: ' + err.message);
    }
  };

  const fetchMessages = async () => {
    setStatus('Récupération des messages...');
    try {
      let token = tokens?.access_token;
      if (!token && tokens?.refresh_token) {
        // Rafraîchir le token si nécessaire
        const newTokens = await window.electronAPI.refreshToken(tokens.refresh_token);
        setTokens(newTokens);
        token = newTokens.access_token;
      }
      if (!token) throw new Error('No access token available');
      const data = await window.electronAPI.getMessages({ accessToken: token, top: 25 });
      setMessages(data.value || []);
      setStatus(`Récupération OK (${(data.value||[]).length} messages)`);
    } catch (err) {
      setStatus('Erreur récupération: ' + err.message);
    }
  };

  const saveMessage = async (message) => {
    if (!folder) { setStatus('Choisir un dossier d\u00e9stination'); return; }
    const safeName = `${message.id}.json`;
    await window.electronAPI.saveFile({ folderPath: folder, fileName: safeName, content: JSON.stringify(message, null, 2) });
    setStatus('Message sauvegardé: ' + safeName);
  };

  const saveFile = async () => {
    if (!folder) {
      setStatus('Veuillez d\u00e9s d\u00e9finir un dossier d\u00e9stination');
      return;
    }
    try {
      const savedPath = await window.electronAPI.saveFile({ folderPath: folder, fileName, content });
      setStatus(`Fichier enregistr\u00e9: ${savedPath}`);
    } catch (err) {
      setStatus(`Erreur: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Bonjour React !</h1>

      <div style={{ marginBottom: 10 }}>
        <button onClick={chooseFolder}>Choisir un dossier</button>
        <div style={{ marginTop: 6 }}>{folder || 'Aucun dossier sélectionné'}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <h2>Authentification Outlook (Device Flow)</h2>
        <button onClick={startAuth}>Démarrer l'authentification</button>
        {deviceInfo && (
          <div style={{ marginTop: 8 }}>
            <div>Visitez: <a href={deviceInfo.verification_uri} target="_blank">{deviceInfo.verification_uri}</a></div>
            <div>Code: <b>{deviceInfo.user_code}</b></div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <button onClick={fetchMessages}>Récupérer les messages</button>
      </div>

      <div>
        <h3>Messages</h3>
        <ul>
          {messages.map(m => (
            <li key={m.id} style={{ marginBottom: 8 }}>
              <div><b>{m.subject}</b> — {m.from?.emailAddress?.name || m.from?.emailAddress?.address}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{m.receivedDateTime}</div>
              <div>
                <button onClick={() => saveMessage(m)}>Sauvegarder</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>Nom de fichier: </label>
        <input value={fileName} onChange={e => setFileName(e.target.value)} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>Contenu:</label>
        <br />
        <textarea rows={8} cols={60} value={content} onChange={e => setContent(e.target.value)} />
      </div>

      <div>
        <button onClick={saveFile}>Enregistrer le fichier</button>
      </div>

      <div style={{ marginTop: 12, color: 'green' }}>{status}</div>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);