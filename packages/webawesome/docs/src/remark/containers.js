import { visit } from 'unist-util-visit';

/**
 * Renders `:::name` container directives as the same markup the old markdown-it containers produced, and turns
 * any other directive (e.g. `:host` or `:state` in prose) back into the text it was written as.
 */
const CHANGELOG_GROUPS = ['added', 'fixed', 'changed', 'deprecated', 'removed', 'breaking'];

/** An mdast node that renders as the given element (MDX has no raw HTML nodes). */
function el(tagName, properties = {}, children = []) {
  return { type: 'containerElement', data: { hName: tagName, hProperties: properties }, children };
}

function text(value) {
  return { type: 'text', value };
}

function icon(name, variant, extra = {}) {
  return el('wa-icon', { slot: 'icon', name, variant, ...extra });
}

/** Pulls the `[label]` paragraph remark-directive attaches to a container. */
function takeLabel(node) {
  const first = node.children[0];
  if (first?.type === 'paragraph' && first.data?.directiveLabel) {
    node.children.shift();
    return first.children.map(child => child.value ?? '').join('');
  }
  return '';
}

function wrap(node, tagName, properties, before = []) {
  node.data = { ...node.data, hName: tagName, hProperties: properties };
  node.children = [...before, ...node.children];
}

function renderContainer(node) {
  const name = node.name;

  if (name === 'info' || name === 'warning') {
    const isWarning = name === 'warning';
    wrap(node, 'wa-callout', { variant: isWarning ? 'warning' : 'brand' }, [
      icon(isWarning ? 'triangle-exclamation' : 'lightbulb', 'regular'),
    ]);
    return true;
  }

  if (name === 'new') {
    wrap(node, 'wa-callout', { variant: 'neutral', className: ['new'] }, [icon('bullhorn', 'solid')]);
    return true;
  }

  if (name === 'pro') {
    const title = takeLabel(node);
    wrap(node, 'wa-callout', { className: ['pro', 'wa-brand-orange'] }, [
      icon('crown', 'regular', { family: 'duotone', className: ['duotone-illustrated'] }),
      ...(title ? [el('strong', {}, [text(title)])] : []),
    ]);
    return true;
  }

  if (name === 'aside') {
    wrap(node, 'aside', {});
    return true;
  }

  if (name === 'details') {
    const title = takeLabel(node);
    wrap(node, 'details', {}, [el('summary', {}, [el('span', {}, [text(title)])])]);
    return true;
  }

  if (CHANGELOG_GROUPS.includes(name)) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    wrap(node, 'div', { className: ['changelog-group', `changelog-group-${name}`] }, [
      el('p', { className: ['wa-visually-hidden'] }, [text(label)]),
    ]);
    return true;
  }

  return false;
}

export function remarkContainers() {
  return (tree, file) => {
    const source = String(file.value);

    visit(tree, ['containerDirective', 'leafDirective', 'textDirective'], (node, index, parent) => {
      if (node.type === 'containerDirective' && renderContainer(node)) {
        return;
      }

      if (node.type === 'containerDirective') {
        file.fail(`Unknown container ":::${node.name}"`, node);
      }

      // Not one of ours, so put back exactly what the author wrote.
      const original = source.slice(node.position.start.offset, node.position.end.offset);
      parent.children.splice(index, 1, { type: 'text', value: original });
      return index;
    });
  };
}
