// Port of LearnLayer/Settings/SettingsKit.swift @ ref 2026-11-04
//
// The pieces every Settings page is built from: a page header, grouped cards of rows, a small badge,
// a progress bar and three button looks. One blue accent, nothing else.

import { Children, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "../Icon";

/** The rounded, slightly raised surface behind a group of rows or a custom block. */
export function SettingsSurface({ highlighted = false, children }: { highlighted?: boolean; children: ReactNode }) {
  return <div className={highlighted ? "settings-surface highlighted" : "settings-surface"}>{children}</div>;
}

/** A titled group: small heading above, a card of rows (hairlines between them), a quiet note below. */
export function SettingsGroup({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      {header ? <h2>{header}</h2> : null}
      <SettingsSurface>
        <div className="settings-divided">{Children.toArray(children)}</div>
      </SettingsSurface>
      {footer ? <p className="settings-footer">{footer}</p> : null}
    </section>
  );
}

/** One page of Settings: title and a muted subtitle on top, groups below, scrolling when tall. */
export function SettingsPage({
  title,
  subtitle,
  badge,
  children,
  ...rest
}: { title: string; subtitle: string; badge?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="settings-scroll" {...rest}>
      <div className="settings-page">
        <header>
          <div className="settings-title">
            <h1>{title}</h1>
            {badge ? <SettingsBadge>{badge}</SettingsBadge> : null}
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

/** A row: title with a muted description on the left, the control on the right. */
export function SettingsRow({
  title,
  detail,
  symbol,
  plain = false,
  children,
}: {
  title: string;
  detail?: string | null;
  symbol?: string;
  /** A statement with no control, set in regular weight. */
  plain?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      {symbol ? <Icon symbol={symbol} size={14} className="settings-row-icon" /> : null}
      <div className="settings-row-text">
        <span className={plain ? "settings-row-title plain" : "settings-row-title"}>{title}</span>
        {detail ? <span className="settings-row-detail">{detail}</span> : null}
      </div>
      {children ? <div className="settings-row-control">{children}</div> : null}
    </div>
  );
}

/** A small pill: "Preview", "This computer". Tinted blue, never louder than the title beside it. */
export function SettingsBadge({ filled = false, children }: { filled?: boolean; children: ReactNode }) {
  return <span className={filled ? "settings-badge filled" : "settings-badge"}>{children}</span>;
}

/** A thin progress bar: a track and a blue fill that eases to its value. */
export function SettingsProgressBar({ fraction, label }: { fraction: number; label?: string }) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <div
      className="settings-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <div className="settings-progress-fill" style={{ width: `max(8px, ${clamped * 100}%)` }} />
    </div>
  );
}

type ButtonKind = "secondary" | "prominent" | "destructive";

/** Three looks: a quiet bordered button, a blue prominent one, and a red-text destructive one. */
export function SettingsButton({
  kind = "secondary",
  fillsWidth = false,
  className,
  ...rest
}: { kind?: ButtonKind; fillsWidth?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ["settings-button", kind, fillsWidth ? "fills" : "", className ?? ""].filter(Boolean).join(" ");
  return <button type="button" className={classes} {...rest} />;
}

/** An on/off switch in a row's control, as the Mac's SettingsToggleRow. */
export function SettingsToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}

/** A pop-up choice in a row's control. */
export function SettingsSelect<Value extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: Value;
  options: readonly { value: Value; title: string }[];
  onChange: (value: Value) => void;
  label: string;
}) {
  return (
    <select
      className="settings-select"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as Value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.title}
        </option>
      ))}
    </select>
  );
}
