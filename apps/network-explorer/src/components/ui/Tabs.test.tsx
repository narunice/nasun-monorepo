import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Tabs } from './Tabs';

const MOCK_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dynamic', label: 'Dynamic Fields' },
  { id: 'raw', label: 'Raw Data' },
];

describe('Tabs', () => {
  it('should render all tab labels', () => {
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={() => {}} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Dynamic Fields')).toBeInTheDocument();
    expect(screen.getByText('Raw Data')).toBeInTheDocument();
  });

  it('should apply active styling to the active tab', () => {
    render(<Tabs tabs={MOCK_TABS} activeTab="dynamic" onTabChange={() => {}} />);
    const dynamicTab = screen.getByText('Dynamic Fields');
    expect(dynamicTab.className).toContain('border-primary');
    expect(dynamicTab.className).toContain('text-primary');
  });

  it('should apply inactive styling to non-active tabs', () => {
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={() => {}} />);
    const rawTab = screen.getByText('Raw Data');
    expect(rawTab.className).toContain('border-transparent');
    expect(rawTab.className).toContain('text-muted-foreground');
  });

  it('should call onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Raw Data'));
    expect(onTabChange).toHaveBeenCalledWith('raw');
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it('should call onTabChange even when clicking the already-active tab', () => {
    const onTabChange = vi.fn();
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Overview'));
    expect(onTabChange).toHaveBeenCalledWith('overview');
  });

  it('should display count when provided', () => {
    const tabsWithCount = [
      { id: 'items', label: 'Items', count: 42 },
      { id: 'empty', label: 'Empty', count: 0 },
    ];
    render(<Tabs tabs={tabsWithCount} activeTab="items" onTabChange={() => {}} />);
    expect(screen.getByText('(42)')).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('should not display count when count is undefined', () => {
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.textContent).not.toMatch(/\(\d+\)/);
    });
  });

  it('should render buttons with type="button"', () => {
    render(<Tabs tabs={MOCK_TABS} activeTab="overview" onTabChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('type', 'button');
    });
  });

  it('should handle empty tabs array', () => {
    const { container } = render(<Tabs tabs={[]} activeTab="none" onTabChange={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(0);
  });

  it('should handle single tab', () => {
    const singleTab = [{ id: 'only', label: 'Only Tab' }];
    render(<Tabs tabs={singleTab} activeTab="only" onTabChange={() => {}} />);
    expect(screen.getByText('Only Tab')).toBeInTheDocument();
  });
});
