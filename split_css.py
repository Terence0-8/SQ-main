#!/usr/bin/env python3
"""
Split solitiquo.css into per-page CSS files + shared.css

Structure of each page block:
  #page-xxx {           <- depth 0->1
    --var: value;       <- direct properties at depth=1
    .selector {         <- sub-block at depth 1->2
      ...
    }                   <- depth 2->1
    @media (...) {      <- media query sub-block
      ...
    }
  }                     <- depth 1->0
"""

import os
import re

CSS_FILE = "/home/user/SQ-main/solitiquo.css"
OUT_DIR = "/home/user/SQ-main/css"
PAGES_DIR = os.path.join(OUT_DIR, "pages")

os.makedirs(PAGES_DIR, exist_ok=True)

# Shared selectors: if a sub-block's opening selector matches one of these,
# it belongs in shared.css (using index page version as canonical)
SHARED_SELECTORS = [
    ".premium-header",
    ".ph-left",
    ".ph-left,",
    ".ph-right",
    ".ph-center",
    ".ph-brand img",
    ".ph-brand",
    ".ph-nav",
    ".ph-link:hover::after",
    ".ph-link:hover",
    ".ph-link.active::after",
    ".ph-link.active",
    ".ph-link::after",
    ".ph-link",
    ".ph-btn-auth",
    ".brand-sep",
    ".brand-text",
    ".burger-container",
    ".burger-btn:hover .burger-line",
    ".burger-btn:hover",
    ".burger-btn",
    ".burger-line",
    ".search-stack",
    ".search-container",
    ".search-input",
    ".search-submit",
    ".premium-footer",
    ".footer-grid",
    ".footer-link:hover",
    ".footer-link",
    ".footer-bottom",
    ".footer-logo",
    ".footer-col h4",
    ".mobile-nav-overlay",
]

def selector_is_shared(opening_line):
    """
    Given the opening line of a sub-block (e.g. '  .premium-header {'),
    return True if its selector matches one of the SHARED_SELECTORS.
    """
    stripped = opening_line.strip()
    # Remove trailing '{'
    sel = stripped.rstrip('{').strip()
    # Also handle multi-selector lines like '.ph-left,' that span two lines
    # Check if the stripped selector matches or starts with any shared selector
    for shared in SHARED_SELECTORS:
        if sel == shared:
            return True
        # Handle case where sel is like ".ph-left," or ".ph-left,\n.ph-right {"
        if sel == shared.rstrip(','):
            return True
    return False


print("Reading CSS file...")
with open(CSS_FILE, "r", encoding="utf-8") as f:
    all_lines = f.readlines()

total_lines = len(all_lines)
print(f"Total lines: {total_lines}")

# Page block definitions (1-indexed, inclusive)
PAGE_BLOCKS = [
    (4004, 4377, "admin"),
    (4382, 4710, "abonnement"),
    (4716, 5097, "admin"),
    (5103, 5619, "article"),
    (5625, 6081, "auth"),
    (6087, 6382, "conditions-utilisation"),
    (6388, 6893, "contact"),
    (6899, 7337, "cookies"),
    (7343, 8149, "dossier"),
    (8155, 8519, "editeur-article"),
    (8525, 8759, "editeur-emission"),
    (8765, 9035, "editeur-parti"),
    (9041, 9435, "editeur-podcast"),
    (9441, 10120, "emissions"),
    (10126, 10962, "index"),
    (10968, 11345, "mentions-legales"),
    (11351, 11543, "page-404"),
    (11549, 11744, "paiement"),
    (11750, 12307, "partis-politiques"),
    (12313, 12877, "podcast"),
    (12883, 13725, "podcasts"),
    (13731, 14162, "politique-confidentialite"),
    (14168, 14923, "politique"),
    (14929, 15599, "profil"),
    (15605, 16013, "recherche"),
    (16019, 16764, "social"),
    (16770, 16874, "test-api-article"),
    (16879, 17285, "recherche"),
    (17686, 17689, "profil"),
]

def parse_page_block(start_1idx, end_1idx, page_name):
    """
    Parse lines[start_1idx-1 : end_1idx] which contain a #page-xxx { ... } block.
    
    Returns a dict:
    {
      'name': page_name,
      'opener': str (the '#page-xxx {' line),
      'direct_props': [str] (lines of direct CSS properties at depth=1),
      'sub_blocks': [
        {
          'opener_lines': [str],  # selector lines (may span multiple lines before '{')
          'body_lines': [str],    # lines between opener and closer (exclusive)
          'closer': str,          # the closing '}' line
          'is_media': bool,
          'is_shared': bool,
          'selector': str,        # normalized selector string
        }
      ],
    }
    """
    lines = all_lines[start_1idx - 1 : end_1idx]
    
    result = {
        'name': page_name,
        'opener': '',
        'direct_props': [],
        'sub_blocks': [],
    }
    
    # Find the page block opener
    page_opener_idx = None
    for idx, line in enumerate(lines):
        if re.match(r'^\s*#page-[\w-]+\s*\{', line):
            page_opener_idx = idx
            result['opener'] = line
            break
    
    if page_opener_idx is None:
        return result
    
    # Parse content inside the page block
    # We track depth relative to file start
    # At the page opener line, depth goes 0->1
    # Sub-blocks are at depth 1->2
    
    depth = 1  # We start inside the page block
    i = page_opener_idx + 1
    
    # State machine
    collecting_direct = True  # Initially collecting direct props
    in_sub_block = False
    sub_opener_lines = []    # accumulate multi-line selectors
    sub_body_lines = []
    sub_depth = 0
    
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        opens = line.count('{')
        closes = line.count('}')
        
        if not in_sub_block:
            # At depth=1, looking for sub-blocks or direct properties
            
            # Net depth change of this line
            net = opens - closes
            
            if opens > 0:
                # This line starts a sub-block (or is on a selector line with '{')
                collecting_direct = False
                
                # The opener might be multi-line (selector on prev line, '{' on this line)
                # or all on one line
                if sub_opener_lines:
                    # We were accumulating opener lines without '{', now we got '{'
                    sub_opener_lines.append(line)
                else:
                    sub_opener_lines = [line]
                
                # Extract selector from opener lines
                selector_text = ' '.join(l.strip().rstrip('{').strip() for l in sub_opener_lines)
                is_media = stripped.startswith('@media') or stripped.startswith('@keyframes')
                is_shared = selector_is_shared(sub_opener_lines[0]) or (
                    len(sub_opener_lines) > 1 and selector_is_shared(sub_opener_lines[1])
                )
                
                in_sub_block = True
                sub_body_lines = []
                sub_depth = net  # starts at the net depth from this opener line
                # If line has both '{' and '}' (same-line block), depth might be back to 1
                
                if sub_depth <= 0:
                    # Block opened and closed on same line
                    result['sub_blocks'].append({
                        'opener_lines': sub_opener_lines,
                        'body_lines': [],
                        'closer': line,
                        'is_media': is_media,
                        'is_shared': is_shared,
                        'selector': selector_text,
                    })
                    in_sub_block = False
                    sub_opener_lines = []
                    sub_body_lines = []
                    sub_depth = 0
                
                i += 1
                continue
            
            elif closes > 0:
                # Closing the page block itself (depth 1->0)
                break
            
            else:
                # No braces: either a direct property or a selector line without '{'
                # (multi-line selector)
                if stripped == '' or stripped.startswith('/*') or stripped.startswith('*') or stripped == '*/':
                    if collecting_direct:
                        result['direct_props'].append(line)
                    i += 1
                    continue
                
                # Check if this looks like a direct property (contains ':' but not as selector)
                # or a selector line for a multi-line block
                # Heuristic: if line ends with ',' or looks like a selector, it's a pending opener
                if stripped.endswith(',') or (not ':' in stripped.split('{')[0] or 
                    stripped.endswith(',') or 
                    re.match(r'^[\.\#\:@\*\[a-zA-Z]', stripped) and not re.search(r':\s', stripped)):
                    # Possible selector continuation
                    # But also could be a direct property like "--var: value;"
                    if stripped.startswith('--') or (re.search(r':\s', stripped) and not stripped.endswith(',')):
                        # Direct property
                        if collecting_direct:
                            result['direct_props'].append(line)
                        i += 1
                        continue
                    elif stripped.endswith(','):
                        # Multi-line selector
                        sub_opener_lines.append(line)
                        collecting_direct = False
                        i += 1
                        continue
                    else:
                        if collecting_direct:
                            result['direct_props'].append(line)
                        i += 1
                        continue
                else:
                    if collecting_direct:
                        result['direct_props'].append(line)
                    i += 1
                    continue
        
        else:
            # Inside a sub-block at depth >= 2
            sub_depth += opens - closes
            
            if sub_depth <= 0:
                # Sub-block is complete
                # The closing line is `line`
                result['sub_blocks'].append({
                    'opener_lines': sub_opener_lines,
                    'body_lines': sub_body_lines,
                    'closer': line,
                    'is_media': sub_opener_lines[0].strip().startswith('@') if sub_opener_lines else False,
                    'is_shared': selector_is_shared(sub_opener_lines[0]) if sub_opener_lines else False,
                    'selector': ' '.join(l.strip().rstrip('{').strip() for l in sub_opener_lines),
                })
                in_sub_block = False
                sub_opener_lines = []
                sub_body_lines = []
                sub_depth = 0
            else:
                sub_body_lines.append(line)
            
            i += 1
            continue
    
    return result


# Parse all blocks
print("\nParsing page blocks...")
parsed_pages = {}  # name -> list of parsed block dicts

for (start, end, name) in PAGE_BLOCKS:
    parsed = parse_page_block(start, end, name)
    n_sub = len(parsed['sub_blocks'])
    n_shared = sum(1 for b in parsed['sub_blocks'] if b['is_shared'])
    n_direct = len([l for l in parsed['direct_props'] if l.strip()])
    print(f"  #page-{name} (L{start}-{end}): {n_sub} sub-blocks ({n_shared} shared), {n_direct} direct prop lines")
    
    if name not in parsed_pages:
        parsed_pages[name] = []
    parsed_pages[name].append(parsed)


# Extract canonical shared blocks from index page
print("\nExtracting canonical shared blocks from index page...")
index_shared = {}  # selector -> list of all lines (opener + body + closer)

if 'index' in parsed_pages:
    for parsed in parsed_pages['index']:
        for block in parsed['sub_blocks']:
            if block['is_shared']:
                sel = block['selector']
                all_block_lines = block['opener_lines'] + block['body_lines'] + [block['closer']]
                index_shared[sel] = all_block_lines
                print(f"  Shared: {sel[:70]}")

print(f"\nTotal canonical shared blocks: {len(index_shared)}")


def block_content_equal(block, canonical_lines):
    """Compare a block's content to canonical lines (ignoring whitespace)."""
    block_lines = block['opener_lines'] + block['body_lines'] + [block['closer']]
    block_text = re.sub(r'\s+', ' ', ''.join(block_lines)).strip()
    canon_text = re.sub(r'\s+', ' ', ''.join(canonical_lines)).strip()
    return block_text == canon_text


def reconstruct_sub_block(block):
    """Reconstruct original lines for a sub-block."""
    return block['opener_lines'] + block['body_lines'] + [block['closer']]


# Build per-page CSS files
print("\nBuilding per-page CSS files...")
page_outputs = {}  # name -> str

for name, entries in parsed_pages.items():
    parts = []
    
    for entry in entries:
        # Collect page-specific content
        page_specific_blocks = []
        
        for block in entry['sub_blocks']:
            if block['is_shared'] and not block['is_media']:
                if name == 'index':
                    # Skip shared blocks from index in the page file
                    continue
                else:
                    # Keep only if content differs from index canonical
                    canonical = index_shared.get(block['selector'])
                    if canonical is not None and block_content_equal(block, canonical):
                        continue  # identical, skip
                    else:
                        page_specific_blocks.append(block)
            else:
                page_specific_blocks.append(block)
        
        # Get direct props (non-blank)
        direct_props = entry['direct_props']
        
        # Only write the page file if there's something page-specific
        has_content = bool(page_specific_blocks) or any(l.strip() for l in direct_props)
        
        if has_content:
            # Reconstruct: #page-name {\n  direct_props\n  page_specific_blocks\n}\n
            out_lines = []
            out_lines.append(entry['opener'])
            
            # Add direct props
            for l in direct_props:
                out_lines.append(l)
            
            # Add page-specific blocks
            for block in page_specific_blocks:
                out_lines.extend(reconstruct_sub_block(block))
            
            out_lines.append('}\n')
            parts.append(''.join(out_lines))
    
    if parts:
        page_outputs[name] = '\n'.join(parts)


# Build shared.css
print("Building shared.css...")
shared_parts = []

# Part 1: Global styles (lines 1-4003)
print("  Global styles (lines 1-4003)...")
shared_parts.append(''.join(all_lines[0:4003]))

# Part 2: Shared component styles (from index page, stripped of page wrapper)
print("  Shared component styles from index page...")
shared_parts.append('\n\n/* ════════════════════════════════════════════════════════\n')
shared_parts.append('   SHARED COMPONENTS: Header, Footer, Navigation, Search\n')
shared_parts.append('   ════════════════════════════════════════════════════════ */\n\n')

if 'index' in parsed_pages:
    for parsed in parsed_pages['index']:
        # Write direct props of index (CSS vars) as a :root or #page-index block
        if any(l.strip() for l in parsed['direct_props']):
            shared_parts.append('/* Index page variables */\n')
            # Skip these - they're page-specific vars, not global
        
        for block in parsed['sub_blocks']:
            if block['is_shared'] and not block['is_media']:
                # Write without any page wrapper - these are top-level selectors
                lines_out = reconstruct_sub_block(block)
                shared_parts.extend(lines_out)
                shared_parts.append('\n')

# Part 3: Orphan party card styles (lines 17286-17685)
print("  Party card styles (lines 17286-17685)...")
shared_parts.append('\n/* ════════════════════════════════════════════════════════\n')
shared_parts.append('   PARTY CARD STYLES\n')
shared_parts.append('   ════════════════════════════════════════════════════════ */\n\n')
shared_parts.extend(all_lines[17285:17685])

# Part 4: Orphan profile styles (lines 17690-18186)
print("  Profile styles (lines 17690-18186)...")
shared_parts.append('\n/* ════════════════════════════════════════════════════════\n')
shared_parts.append('   PROFILE STYLES\n')
shared_parts.append('   ════════════════════════════════════════════════════════ */\n\n')
shared_parts.extend(all_lines[17689:18186])

shared_content = ''.join(shared_parts)


# Write all files
print("\nWriting files...")

shared_path = os.path.join(OUT_DIR, "shared.css")
with open(shared_path, "w", encoding="utf-8") as f:
    f.write(shared_content)
shared_lc = shared_content.count('\n')
print(f"  shared.css: {shared_lc} lines")

written_pages = {}
for name, content in page_outputs.items():
    page_path = os.path.join(PAGES_DIR, f"{name}.css")
    with open(page_path, "w", encoding="utf-8") as f:
        f.write(content)
    lc = content.count('\n')
    written_pages[name] = lc
    print(f"  pages/{name}.css: {lc} lines")


# Summary
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"\ncss/shared.css")
print(f"  Lines: {shared_content.count(chr(10))}")

print(f"\ncss/pages/ ({len(written_pages)} files)")
for name in sorted(written_pages):
    print(f"  {name}.css: {written_pages[name]} lines")

print(f"\nVerification:")
print(f"  shared.css exists: {os.path.exists(shared_path)}")
print(f"  Page files: {len(written_pages)} (need >= 15)")
print(f"  {'PASS' if len(written_pages) >= 15 else 'FAIL'}: page count")
print(f"  Canonical shared blocks: {len(index_shared)}")
print("\nDone!")
