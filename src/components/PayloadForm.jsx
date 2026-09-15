import { PAYLOAD_TYPES } from '../payloads/index.js';
import { WIFI_AUTH, WPA3_NOTE } from '../payloads/wifi.js';
import { CONTACT_FORMAT_HELP } from '../payloads/vcard.js';
import { SMS_FORMATS } from '../payloads/sms.js';
import { STORES, APPSTORE_NOTE } from '../payloads/appstore.js';
import { validateIban } from '../payloads/sepa.js';
import Icon from './Icon.jsx';
import Notice, { noticeKind } from './Notice.jsx';

/**
 * The form for whichever payload type is selected.
 *
 * Every field has a visible label. Placeholder-as-label breaks the moment
 * someone starts typing, and this form is full of fields where you genuinely
 * need to remember which one you are in.
 */

function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="hint" id={`${id}-error`} style={{ color: 'var(--danger)', fontWeight: 600 }}>
          <Icon name="exclamation-triangle-fill" size={13} /> {error}
        </p>
      )}
    </div>
  );
}

function Text({ id, value, onChange, error, hint, mono, type = 'text', ...rest }) {
  return (
    <input
      id={id}
      type={type}
      className={`input${mono ? ' input-mono' : ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      {...rest}
    />
  );
}

/**
 * @param {object} props
 * @param {string} props.typeId
 * @param {object} props.input
 * @param {(patch: object) => void} props.onChange
 * @param {(id: string) => void} props.onTypeChange
 * @param {{field: string, level: string, message: string}[]} props.issues
 */
export default function PayloadForm({ typeId, input, onChange, onTypeChange, issues }) {
  const errorFor = (field) => issues.find((i) => i.field === field && i.level === 'error')?.message;
  const set = (field) => (value) => onChange({ [field]: value });

  return (
    <div className="stack">
      <div className="field">
        <span className="label" id="type-label">
          What should the code do?
        </span>
        <div
          className="chip-row"
          role="tablist"
          aria-labelledby="type-label"
          style={{ gap: 'var(--s-2)' }}
        >
          {PAYLOAD_TYPES.map((t) => {
            const selected = t.id === typeId;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTypeChange(t.id)}
                className="chip"
                style={{
                  minHeight: 38,
                  cursor: 'pointer',
                  borderColor: selected ? 'var(--accent)' : 'var(--border)',
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                  color: selected ? 'var(--accent)' : 'var(--text-2)',
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <Fields typeId={typeId} input={input} set={set} errorFor={errorFor} onChange={onChange} />

      {issues
        .filter((i) => i.level === 'warning')
        .map((i, n) => (
          <Notice key={`${i.field}-${n}`} kind={noticeKind(i.level)}>
            {i.message}
          </Notice>
        ))}
    </div>
  );
}

function Fields({ typeId, input, set, errorFor, onChange }) {
  switch (typeId) {
    case 'url':
      return (
        <Field
          id="f-url"
          label="Web address"
          hint="The address the code opens. Type or paste it exactly as it should work."
          error={errorFor('url')}
        >
          <Text
            id="f-url"
            value={input.url}
            onChange={set('url')}
            error={errorFor('url')}
            hint
            mono
            inputMode="url"
            autoComplete="url"
            spellCheck="false"
            placeholder="https://example.com/menu"
          />
        </Field>
      );

    case 'text':
      return (
        <Field
          id="f-text"
          label="Text"
          hint="Shown as words when scanned. Nothing opens and nothing is sent."
          error={errorFor('text')}
        >
          <textarea
            id="f-text"
            className="textarea"
            value={input.text ?? ''}
            onChange={(e) => set('text')(e.target.value)}
            aria-invalid={errorFor('text') ? 'true' : undefined}
            placeholder="Filter changed 4 March 2026."
          />
        </Field>
      );

    case 'wifi':
      return (
        <>
          <Field
            id="f-ssid"
            label="Network name"
            hint="Exactly as it appears in the Wi-Fi list, including capitals."
            error={errorFor('ssid')}
          >
            <Text id="f-ssid" value={input.ssid} onChange={set('ssid')} error={errorFor('ssid')} hint mono spellCheck="false" />
          </Field>

          <Field id="f-auth" label="Security">
            <select
              id="f-auth"
              className="select"
              value={input.auth ?? 'WPA'}
              onChange={(e) => set('auth')(e.target.value)}
            >
              {WIFI_AUTH.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="hint">{WIFI_AUTH.find((a) => a.value === (input.auth ?? 'WPA'))?.note}</p>
          </Field>

          {(input.auth ?? 'WPA') !== 'nopass' && (
            <Field
              id="f-pass"
              label="Password"
              hint="Special characters are escaped correctly, so semicolons, colons, commas, quotes and backslashes are safe to use."
              error={errorFor('password')}
            >
              <Text
                id="f-pass"
                value={input.password}
                onChange={set('password')}
                error={errorFor('password')}
                hint
                mono
                spellCheck="false"
                autoComplete="off"
              />
            </Field>
          )}

          <label className="checkbox-row" htmlFor="f-hidden">
            <input
              id="f-hidden"
              type="checkbox"
              checked={!!input.hidden}
              onChange={(e) => set('hidden')(e.target.checked)}
            />
            <span>
              <strong style={{ fontWeight: 600 }}>This network is hidden</strong>
              <span className="hint" style={{ display: 'block' }}>
                Only tick this if the network does not broadcast its name.
              </span>
            </span>
          </label>

          <Notice kind="info" word="About WPA3">
            {WPA3_NOTE}
          </Notice>
        </>
      );

    case 'contact':
      return (
        <>
          <Field id="f-format" label="Card format">
            <div className="segmented" role="group" aria-label="Card format">
              {[
                { id: 'vcard', label: 'vCard' },
                { id: 'mecard', label: 'meCard' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={(input.format ?? 'vcard') === f.id}
                  onClick={() => set('format')(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="hint">{CONTACT_FORMAT_HELP[input.format ?? 'vcard']}</p>
          </Field>

          <div className="grid-2">
            <Field id="f-first" label="First name" error={errorFor('firstName')}>
              <Text id="f-first" value={input.firstName} onChange={set('firstName')} autoComplete="given-name" />
            </Field>
            <Field id="f-last" label="Last name">
              <Text id="f-last" value={input.lastName} onChange={set('lastName')} autoComplete="family-name" />
            </Field>
          </div>

          <div className="grid-2">
            <Field id="f-org" label="Organisation">
              <Text id="f-org" value={input.organisation} onChange={set('organisation')} autoComplete="organization" />
            </Field>
            <Field id="f-title" label="Job title">
              <Text id="f-title" value={input.title} onChange={set('title')} autoComplete="organization-title" />
            </Field>
          </div>

          <div className="grid-2">
            <Field id="f-mobile" label="Mobile" error={errorFor('phone')}>
              <Text id="f-mobile" value={input.mobile} onChange={set('mobile')} type="tel" mono autoComplete="tel" />
            </Field>
            <Field id="f-email" label="Email">
              <Text id="f-email" value={input.email} onChange={set('email')} type="email" mono autoComplete="email" />
            </Field>
          </div>

          <Field id="f-web" label="Website">
            <Text id="f-web" value={input.website} onChange={set('website')} type="url" mono />
          </Field>

          <details className="disclosure">
            <summary>
              Postal address
              <Icon name="chevron-right" size={14} className="chev" />
            </summary>
            <div className="disclosure-body stack">
              <Field id="f-street" label="Street">
                <Text id="f-street" value={input.street} onChange={set('street')} autoComplete="street-address" />
              </Field>
              <div className="grid-2">
                <Field id="f-city" label="City">
                  <Text id="f-city" value={input.city} onChange={set('city')} />
                </Field>
                <Field id="f-post" label="Postcode">
                  <Text id="f-post" value={input.postcode} onChange={set('postcode')} mono />
                </Field>
              </div>
              <div className="grid-2">
                <Field id="f-region" label="County or region">
                  <Text id="f-region" value={input.region} onChange={set('region')} />
                </Field>
                <Field id="f-country" label="Country">
                  <Text id="f-country" value={input.country} onChange={set('country')} />
                </Field>
              </div>
            </div>
          </details>
        </>
      );

    case 'email':
      return (
        <>
          <Field id="f-to" label="Send to" error={errorFor('to')}>
            <Text id="f-to" value={input.to} onChange={set('to')} error={errorFor('to')} type="email" mono autoComplete="email" />
          </Field>
          <Field id="f-subject" label="Subject">
            <Text id="f-subject" value={input.subject} onChange={set('subject')} />
          </Field>
          <Field id="f-body" label="Message" hint="Pre-filled, and the sender can still change it before sending.">
            <textarea
              id="f-body"
              className="textarea"
              value={input.body ?? ''}
              onChange={(e) => set('body')(e.target.value)}
            />
          </Field>
        </>
      );

    case 'sms':
      return (
        <>
          <Field id="f-sms-num" label="Phone number" error={errorFor('number')}>
            <Text id="f-sms-num" value={input.number} onChange={set('number')} error={errorFor('number')} type="tel" mono />
          </Field>
          <Field id="f-sms-msg" label="Message">
            <Text id="f-sms-msg" value={input.message} onChange={set('message')} />
          </Field>
          <Field id="f-sms-fmt" label="Format">
            <select
              id="f-sms-fmt"
              className="select"
              value={input.format ?? 'rfc'}
              onChange={(e) => set('format')(e.target.value)}
            >
              {SMS_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="hint">{SMS_FORMATS.find((f) => f.value === (input.format ?? 'rfc'))?.note}</p>
          </Field>
        </>
      );

    case 'tel':
      return (
        <Field
          id="f-tel"
          label="Phone number"
          hint="Include the country code, like +40 722 123 456."
          error={errorFor('number')}
        >
          <Text id="f-tel" value={input.number} onChange={set('number')} error={errorFor('number')} hint type="tel" mono />
        </Field>
      );

    case 'geo':
      return (
        <>
          <div className="grid-2">
            <Field id="f-lat" label="Latitude" error={errorFor('latitude')}>
              <Text id="f-lat" value={input.latitude} onChange={set('latitude')} error={errorFor('latitude')} mono inputMode="decimal" />
            </Field>
            <Field id="f-lon" label="Longitude" error={errorFor('longitude')}>
              <Text id="f-lon" value={input.longitude} onChange={set('longitude')} error={errorFor('longitude')} mono inputMode="decimal" />
            </Field>
          </div>
          <p className="hint">
            Decimal degrees, as they appear in Google Maps or a GPS. Six decimal places is about 11 centimetres, and
            anything beyond that only makes the code denser.
          </p>
        </>
      );

    case 'event':
      return (
        <>
          <Field id="f-summary" label="Event name" error={errorFor('summary')}>
            <Text id="f-summary" value={input.summary} onChange={set('summary')} error={errorFor('summary')} />
          </Field>
          <Field id="f-loc" label="Where">
            <Text id="f-loc" value={input.location} onChange={set('location')} />
          </Field>
          <div className="grid-2">
            <Field id="f-start" label="Starts" error={errorFor('start')}>
              <Text
                id="f-start"
                value={input.start}
                onChange={set('start')}
                error={errorFor('start')}
                type={input.allDay ? 'date' : 'datetime-local'}
                mono
              />
            </Field>
            <Field id="f-end" label="Ends">
              <Text id="f-end" value={input.end} onChange={set('end')} type={input.allDay ? 'date' : 'datetime-local'} mono />
            </Field>
          </div>
          <label className="checkbox-row" htmlFor="f-allday">
            <input id="f-allday" type="checkbox" checked={!!input.allDay} onChange={(e) => set('allDay')(e.target.checked)} />
            <span>
              <strong style={{ fontWeight: 600 }}>All day</strong>
            </span>
          </label>
          <label className="checkbox-row" htmlFor="f-utc">
            <input
              id="f-utc"
              type="checkbox"
              checked={!!input.utc}
              disabled={!!input.allDay}
              onChange={(e) => set('utc')(e.target.checked)}
            />
            <span>
              <strong style={{ fontWeight: 600 }}>Fix to one worldwide moment</strong>
              <span className="hint" style={{ display: 'block' }}>
                Leave this off for a poster: 7pm then means 7pm wherever the reader is. Turn it on for an online event
                that happens at a single instant everywhere.
              </span>
            </span>
          </label>
        </>
      );

    case 'sepa': {
      const iban = validateIban(input.iban ?? '');
      return (
        <>
          <Field id="f-sepa-name" label="Who is being paid" error={errorFor('name')}>
            <Text id="f-sepa-name" value={input.name} onChange={set('name')} error={errorFor('name')} maxLength={70} />
          </Field>
          <Field
            id="f-iban"
            label="IBAN"
            hint={
              iban.valid
                ? `Checked: the check digits are correct for ${iban.country}.`
                : 'Checked against its own check digits, so a mistyped character is caught here rather than by the bank.'
            }
            error={errorFor('iban')}
          >
            <Text id="f-iban" value={input.iban} onChange={set('iban')} error={errorFor('iban')} hint mono spellCheck="false" />
          </Field>
          <div className="grid-2">
            <Field id="f-amount" label="Amount in euro" hint="Leave empty to let the payer type it." error={errorFor('amount')}>
              <Text id="f-amount" value={input.amount} onChange={set('amount')} error={errorFor('amount')} hint mono inputMode="decimal" />
            </Field>
            <Field id="f-bic" label="BIC" hint="Not needed inside the SEPA area." error={errorFor('bic')}>
              <Text id="f-bic" value={input.bic} onChange={set('bic')} error={errorFor('bic')} hint mono />
            </Field>
          </div>
          <Field id="f-rem" label="Reference for the payment" error={errorFor('remittance')}>
            <Text id="f-rem" value={input.remittance} onChange={set('remittance')} error={errorFor('remittance')} maxLength={140} />
          </Field>
          <Notice kind="info" word="What this is">
            This fills in a transfer inside a banking app. Nothing is charged by scanning it: the payer still confirms
            the payment themselves. An ordinary phone camera cannot read this format, only banking apps can.
          </Notice>
        </>
      );
    }

    case 'appstore':
      return (
        <>
          <Field id="f-store" label="Where should it go?">
            <select id="f-store" className="select" value={input.store ?? 'landing'} onChange={(e) => set('store')(e.target.value)}>
              {STORES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="hint">{STORES.find((s) => s.value === (input.store ?? 'landing'))?.hint}</p>
          </Field>
          <Field id="f-app-url" label="Link" error={errorFor('url')}>
            <Text id="f-app-url" value={input.url} onChange={set('url')} error={errorFor('url')} mono type="url" />
          </Field>
          <Notice kind="warn" word="One code, one destination">
            {APPSTORE_NOTE}
          </Notice>
        </>
      );

    default:
      return null;
  }
}
