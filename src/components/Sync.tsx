// Header button and menu of the Google Drive synchronization.
import { useEffect, useRef, useState } from 'preact/hooks';
import { deleteRemote, disconnect, loadGis, syncNow, useSync } from '../gsync';
import { Icon } from './ui';

const time = (t: number) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function SyncButton() {
  const st = useSync();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void loadGis().catch(() => {});
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  const icon = st.status === 'off' ? 'cloudOff' : st.status === 'syncing' ? 'sync' : st.status === 'ok' ? 'cloudDone' : 'cloud';
  const label = st.status === 'off' ? 'Синхронизация выключена'
    : st.status === 'syncing' ? 'Синхронизация…'
    : st.status === 'ok' ? `Синхронизировано${st.lastSync ? ` в ${time(st.lastSync)}` : ''}`
    : st.status === 'error' ? 'Ошибка синхронизации'
    : st.pending ? 'Есть изменения не на Диске — войдите в Google' : 'Войдите в Google, чтобы синхронизировать';
  const attention = st.status === 'login' || st.status === 'error' || st.pending;
  return (
    <div class="theme sync" ref={ref}>
      <button type="button" class={`icon-btn theme-btn sync-btn s-${st.status}${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open}
        title={label} aria-label={`Синхронизация: ${label}`} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
        {attention && st.status !== 'off' && <span class="sync-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div class="menu sync-menu" role="dialog" aria-label="Синхронизация">
          <b>Синхронизация через Google Drive</b>
          {st.status === 'off' ? <>
            <p class="hint">Списки заклинаний, персонажи (с фото) и наборы характеристик хранятся в скрытой папке приложения на вашем Google Диске
              и одинаковы на всех устройствах, где вы вошли. Сайт видит только эту папку; пароль сайта туда не попадает.</p>
            <button type="button" class="btn primary small" onClick={() => void syncNow()}><Icon name="cloud" size={16} /> Войти через Google</button>
            <p class="hint">Войти могут только аккаунты из списка разрешённых.</p>
          </> : <>
            {st.email && <p class="sync-acc">{st.email}</p>}
            <p class={`hint${st.status === 'ok' ? ' ok' : ''}`} role="status">{label}</p>
            {st.status === 'login' && <p class="hint">Google выдаёт доступ на час и только по нажатию — после перезагрузки сайта нажмите ещё раз.</p>}
            <button type="button" class="btn small" disabled={st.status === 'syncing'} onClick={() => void syncNow()}>
              <Icon name="sync" size={16} /> {st.status === 'login' ? 'Войти и синхронизировать' : 'Синхронизировать сейчас'}
            </button>
            <div class="sync-links">
              <button type="button" class="link" onClick={() => { if (confirm('Отключить синхронизацию на этом устройстве? Данные останутся и здесь, и на Диске.')) disconnect(); }}>отключить здесь</button>
              <button type="button" class="link" onClick={() => { if (confirm('Удалить копию данных с Google Диска? На этом устройстве всё останется; при следующей синхронизации копия создастся заново.')) void deleteRemote(); }}>удалить копию с Диска</button>
            </div>
          </>}
          {st.error && <p class="hint warn" role="alert">{st.error}</p>}
        </div>
      )}
    </div>
  );
}
