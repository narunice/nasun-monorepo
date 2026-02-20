import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('should render children text', () => {
    render(<Badge>Test Label</Badge>);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('should default to "default" variant', () => {
    const { container } = render(<Badge>Default</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-muted');
    expect(badge.className).toContain('text-muted-foreground');
  });

  it('should apply "success" variant classes', () => {
    const { container } = render(<Badge variant="success">Success</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-green-500/10');
    expect(badge.className).toContain('text-green-400');
  });

  it('should apply "error" variant classes', () => {
    const { container } = render(<Badge variant="error">Error</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-destructive/10');
    expect(badge.className).toContain('text-destructive');
  });

  it('should apply "info" variant classes', () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-primary/20');
    expect(badge.className).toContain('text-primary');
  });

  it('should apply "shared" variant classes', () => {
    const { container } = render(<Badge variant="shared">Shared</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-500/10');
    expect(badge.className).toContain('text-blue-400');
  });

  it('should apply "immutable" variant classes', () => {
    const { container } = render(<Badge variant="immutable">Immutable</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-purple-500/10');
    expect(badge.className).toContain('text-purple-400');
  });

  it('should apply "child" variant classes', () => {
    const { container } = render(<Badge variant="child">Child</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-amber-500/10');
    expect(badge.className).toContain('text-amber-400');
  });

  it('should apply object change variants (created, mutated, deleted, wrapped, published)', () => {
    const { unmount: u1 } = render(<Badge variant="created">Created</Badge>);
    expect(screen.getByText('Created').className).toContain('text-green-400');
    u1();

    const { unmount: u2 } = render(<Badge variant="mutated">Mutated</Badge>);
    expect(screen.getByText('Mutated').className).toContain('text-primary');
    u2();

    const { unmount: u3 } = render(<Badge variant="deleted">Deleted</Badge>);
    expect(screen.getByText('Deleted').className).toContain('text-destructive');
    u3();

    const { unmount: u4 } = render(<Badge variant="wrapped">Wrapped</Badge>);
    expect(screen.getByText('Wrapped').className).toContain('text-muted-foreground');
    u4();

    render(<Badge variant="published">Published</Badge>);
    expect(screen.getByText('Published').className).toContain('text-blue-400');
  });

  it('should always include base styling classes', () => {
    const { container } = render(<Badge>Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('px-2');
    expect(badge.className).toContain('py-0.5');
    expect(badge.className).toContain('rounded-sm');
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('font-medium');
    expect(badge.className).toContain('uppercase');
    expect(badge.className).toContain('tracking-wider');
    expect(badge.className).toContain('border');
  });

  it('should render as inline-flex span element', () => {
    const { container } = render(<Badge>Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('inline-flex');
  });

  it('should append custom className', () => {
    const { container } = render(<Badge className="my-custom">Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('my-custom');
  });
});
