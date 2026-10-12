import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type ReactNode,
  type ReactElement,
} from 'react';
import * as Select from '@radix-ui/react-select';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';

// Unstyled primitives share our tokens; portals handle clipping and viewport collision.
export function Choice({
  children,
  value,
  defaultValue,
  name,
  onChange,
  id,
  disabled,
  'aria-label': label,
}: {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (event: { target: { value: string } }) => void;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const options = Children.toArray(children).filter(isValidElement) as ReactElement<{
    value: string;
    children: ReactNode;
  }>[];
  return (
    <Select.Root
      name={name}
      defaultValue={defaultValue}
      value={value}
      onValueChange={(value) => onChange?.({ target: { value } })}
      disabled={disabled}
    >
      <Select.Trigger id={id} aria-label={label} className="choice-trigger">
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="choice-content"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="choice-scroll">
            <ChevronDown size={16} className="rotate-180" />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                className="choice-item"
                value={String(option.props.value)}
                key={String(option.props.value)}
              >
                <Select.ItemText>{option.props.children}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="choice-scroll">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
export function ActionMenu({
  trigger,
  label,
  children,
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="action-menu"
          aria-label={label}
          align="end"
          sideOffset={10}
          collisionPadding={12}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export const MenuItem = Dropdown.Item;
export const MenuLabel = Dropdown.Label;
export const MenuSeparator = Dropdown.Separator;
export function Modal({
  label,
  children,
  onClose,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const focused = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      focused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="product-modal"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
export function EmptyState({
  headingLevel = 3,
  icon,
  title,
  children,
  action,
}: {
  headingLevel?: 2 | 3;
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      {headingLevel === 2 ? <h2>{title}</h2> : <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
