import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalBuilderSettings from '../PortalBuilderSettings';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  publish: vi.fn(),
  preview: vi.fn(),
  restore: vi.fn(),
  refetch: vi.fn(),
  versionsRefetch: vi.fn(),
  record: null,
}));
const translate = (key) => key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate, i18n: { language: 'en' } }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn() } }));
vi.mock('../../../utils/portalUrls', () => ({
  getPortalUrl: (path) => `https://portal.example${path}`,
}));
vi.mock('../../../store/api/portalBuilderApi', () => ({
  useGetPortalBuilderQuery: () => ({ data: mocks.record, refetch: mocks.refetch }),
  useGetPortalVersionsQuery: () => ({
    data: [{ version_id: 1, published_at: '2026-10-01T12:00:00Z' }],
    refetch: mocks.versionsRefetch,
  }),
  useSavePortalDraftMutation: () => [mocks.save],
  usePublishPortalMutation: () => [mocks.publish],
  useRestorePortalMutation: () => [mocks.restore],
  usePreviewPortalMutation: () => [mocks.preview],
}));
const label = (name) => `settings.portalBuilder.${name}`;
const button = (name) => screen.getByRole('button', { name: label(name) });
const text = () => ({ ar: '', en: '' });
function editTitle(value) {
  const group = screen.getByRole('group', { name: label('heroTitle') });
  fireEvent.change(within(group).getByRole('textbox', { name: label('en') }), {
    target: { value },
  });
}
describe('Portal Builder administrative workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const hero = { title: { ar: '', en: 'Original' }, subtitle: text(), imageUrl: '' };
    mocks.record = {
      revision: 3,
      published_version_id: 1,
      draft: {
        schemaVersion: 2,
        enabled: true,
        templateId: 'clinical',
        theme: { accentColor: '', density: 'comfortable' },
        hero,
        sections: [
          'hero',
          'services',
          'why',
          'journey',
          'locations',
          'testimonials',
          'faq',
          'support',
        ].map((id) => ({ id, enabled: true })),
        announcement: { enabled: false, text: text(), url: '' },
        seo: { title: text(), description: text(), ogImageUrl: '' },
        faqs: [],
        testimonials: [],
        audienceOverrides: {},
      },
    };
    mocks.save.mockImplementation((input) => ({
      unwrap: () => Promise.resolve({ ...mocks.record, revision: 4, draft: input.page }),
    }));
    mocks.publish.mockReturnValue({
      unwrap: () => Promise.resolve({ ...mocks.record, revision: 5, published_version_id: 2 }),
    });
    mocks.preview.mockReturnValue({ unwrap: () => Promise.resolve({ token: 'a'.repeat(64) }) });
    mocks.restore.mockReturnValue({
      unwrap: () => Promise.resolve({ ...mocks.record, revision: 4 }),
    });
  });
  it('saves content without publishing it', async () => {
    render(<PortalBuilderSettings />);
    editTitle('Draft title');
    fireEvent.click(button('save'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      revision: 3,
      page: { hero: { title: { en: 'Draft title' } } },
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('persists changes before creating a preview for the saved revision', async () => {
    render(<PortalBuilderSettings />);
    editTitle('Preview title');
    fireEvent.click(button('preview'));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith({ revision: 4 }));
    const link = await screen.findByRole('link', { name: label('openPreview') });
    expect(link.getAttribute('href')).toBe(
      `https://portal.example/?target=patients#preview=${'a'.repeat(64)}`
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('changes doctor overrides without modifying shared content', async () => {
    render(<PortalBuilderSettings />);
    fireEvent.change(screen.getByRole('combobox', { name: label('audience') }), {
      target: { value: 'doctors' },
    });
    editTitle('Doctor title');
    fireEvent.click(button('save'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const page = mocks.save.mock.calls[0][0].page;
    expect(page.hero.title.en).toBe('Original');
    expect(page.audienceOverrides.doctors.hero.title.en).toBe('Doctor title');
  });
  it('blocks publishing after a stale draft conflict', async () => {
    mocks.save.mockReturnValue({ unwrap: () => Promise.reject({ status: 409 }) });
    render(<PortalBuilderSettings />);
    editTitle('Conflicting title');
    fireEvent.click(button('save'));
    await screen.findByRole('alert');
    await waitFor(() => expect(button('publish')).toBeDisabled());
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('restores an earlier version into the draft without publishing', async () => {
    render(<PortalBuilderSettings />);
    fireEvent.click(button('restore'));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith({ revision: 3, versionId: 1 }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('applies a complete layout preset and preserves existing component copy', async () => {
    mocks.record.draft.sections[1].heading = { ar: '', en: 'Our actual services' };
    render(<PortalBuilderSettings />);
    fireEvent.click(
      screen.getByRole('button', { name: /settings.portalBuilder.templates.modern / })
    );
    fireEvent.click(button('save'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const page = mocks.save.mock.calls[0][0].page;
    expect(page.layout).toMatchObject({
      heroHeight: 'tall',
      cardStyle: 'elevated',
      navStyle: 'solid',
    });
    expect(page.sections.find((section) => section.id === 'services').heading.en).toBe(
      'Our actual services'
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('saves header and footer customizations within the doctor audience', async () => {
    render(<PortalBuilderSettings />);
    fireEvent.change(screen.getByRole('combobox', { name: label('audience') }), {
      target: { value: 'doctors' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: label('layout.container') }), {
      target: { value: 'boxed' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: label('layout.showContact') }));
    fireEvent.click(button('save'));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const page = mocks.save.mock.calls[0][0].page;
    expect(page.audienceOverrides.doctors.layout.container).toBe('boxed');
    expect(page.audienceOverrides.doctors.footer.showContact).toBe(false);
    expect(page.footer).toBeUndefined();
  });
});
