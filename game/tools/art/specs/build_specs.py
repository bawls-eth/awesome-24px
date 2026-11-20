#!/usr/bin/env python3
"""Regenerates the six hero class specs (+ enemy/item examples) from the tables below.

The JSON files next to this script are the artefacts the pipeline reads; edit either the JSON directly or this table and
re-run `python3 game/tools/art/specs/build_specs.py`.  Original designs only.  Hex colours come from the shared
palette (union of b00 + b01 palette.json); spec_lib.py checks that.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

PROPORTIONS = {
    'style': 'short wide chibi: big head (about 1/3 of the height), stocky wide torso, short thick limbs, big hands and boots',
    'standing_height_px': 148,
    'cell_px': 256,
    'notes': 'Standing height is equal in the down, up and right views. Feet of every frame rest on ONE baseline row.',
}

VIEWS = {
    'down': {
        'descriptor': 'FRONT view (down): the figure faces the camera, face and chest visible, both boots visible, toes toward the viewer.',
        'face_visible': True,
    },
    'up': {
        'descriptor': 'BACK view (up): the figure faces away from the camera. NO face, NO eyes, NO mouth anywhere: show only the back of the head/headgear, the back of the torso, back armour and the cape/cloth hanging down the back, and the heels of both boots.',
        'face_visible': False,
    },
    'right': {
        'descriptor': 'RIGHT side view (right): a TRUE side profile facing the right edge of the image, body turned exactly 90 degrees, one eye only, nose/brow in profile; the NEAR arm and NEAR leg are drawn IN FRONT of the torso, the far limbs partly hidden behind it.',
        'true_profile': True,
    },
}

# action -> (frames, fps, loop, ref_frames)
ACTIONS = {
    'idle': (4, 6, True, [0, 1, 2, 3]),
    'walk': (6, 10, True, [0, 1, 2, 3, 4, 5]),
    'attack': (5, 12, False, [0]),
    'cast': (5, 10, False, [0]),
    'roll': (6, 12, True, [0]),
    'hit': (2, 8, False, [0]),
    'death': (6, 8, False, [0]),
}


def common_poses(carry, cloth_word):
    return {
        'idle': [
            'Stand relaxed, feet shoulder-width apart, %s, chest rests low.' % carry,
            'Breathe in: torso rises one pixel step, shoulders lift slightly, %s.' % cloth_word,
            'Peak of the breath: head and chest at their highest, arms swing a hair outward, %s sways a little.' % cloth_word,
            'Breathe out: torso sinks back lower than frame 1, weight shifts slightly, %s settles.' % cloth_word,
        ],
        'walk': [
            'Contact: left boot planted forward, right boot behind on its toes, arms opposite to legs, %s.' % carry,
            'Down: body at its lowest, left boot flat under the body, right boot lifting off, right knee bent.',
            'Passing: right leg swings through beside the planted left leg, body at its highest, %s.' % cloth_word,
            'Contact: right boot planted forward, left boot behind on its toes, arms swapped, %s.' % carry,
            'Down: body at its lowest, right boot flat under the body, left boot lifting off, left knee bent.',
            'Passing: left leg swings through beside the planted right leg, body at its highest, %s flares.' % cloth_word,
        ],
        'roll': [
            'Crouch low, knees bent deeply, head ducked forward, %s pulled in tight.' % carry,
            'Launch: body tipping forward, head tucked, back arching, both boots still visible leaving the floor.',
            'Tumble 1: figure curled into a compact ball, head near the knees, back toward the camera side, boots tucked.',
            'Tumble 2: the ball has rotated half a turn, upside down, boots up top, head tucked below.',
            'Tumble 3: rotating up out of the ball, legs reaching down toward the ground, head coming up.',
            'Landing: one knee bent, other boot planted, rising out of the roll, %s back in hand.' % carry,
        ],
        'hit': [
            'Struck: head snaps back, torso leans away from the blow, eyes squeezed shut, arms flung outward, %s.' % carry,
            'Recoil: body bent at the waist, knees buckled, one boot sliding back, wincing, %s.' % carry,
        ],
        'death': [
            'Fatal hit: head snaps back, torso arching, %s loosening in the grip.' % carry,
            'Stumble: knees give way, one knee drops, a hand drops the weapon, head hangs.',
            'Fall: body topples sideways, both arms flailing, boots leaving the ground.',
            'Impact: the body lands on its side, weapon clattering beside it, cloth settling.',
            'Slump: the body flat on the ground, one arm stretched out, legs straight, head turned.',
            'Final: lying completely still on the ground, weapon at rest next to the hand, cloth lying flat. Feet on the baseline row.',
        ],
    }


CLASSES = {
    'rogue': dict(
        batch='b02', title='Rogue (shadow knifer)',
        summary='Lean, quick shadow-thief in dark grey leathers with a long crimson scarf and two crossed daggers.',
        silhouette='Wide low hood with a pointed tip, scarf tail streaming to one side, two short blades jutting out at the hips; short and wide.',
        headgear=('pointed hood', 'Deep dark-grey pointed hood that shades the eyes, hood tip flopping to the back, a small crimson trim line at the brim.'),
        armour=[('shoulders', 'Small studded leather pauldrons.', '#5a514b'),
                ('chest', 'Dark-grey leather jerkin with two crossing belts.', '#463d3d'),
                ('belt', 'Wide belt with a steel buckle and two dagger sheaths.', '#5b371d'),
                ('boots', 'Soft grey boots with folded cuffs.', '#291c24')],
        cloth='Long crimson scarf wrapped twice around the neck with two tails trailing behind; short dark-grey half cape at the back.',
        palette=dict(outline='#080706', cloth_dark='#463d3d', cloth_mid='#5a514b', cloth_light='#6f6876', scarf='#ad181b', scarf_dark='#76101c',
                     scarf_light='#d63b36', skin='#ecc6a1', steel='#ccc9cd', steel_dark='#938b95', leather='#5b371d', boot='#291c24'),
        weapon=('twin daggers', 'both', 'Two short curved steel daggers with dark-grey grips, one in each hand, blades pointing forward and down when idle.', ['#ccc9cd', '#e4e1e1']),
        carry='twin daggers held low in both hands', cloth_word='the crimson scarf tails',
        attack=['Wind-up: both daggers pulled back beside the hips, weight on the back foot, hood tilted forward.',
                'Right dagger slashes across the body from upper left to lower right, body twisting forward, blade fully visible.',
                'Left dagger follows with a stabbing thrust straight ahead, both arms extended, front knee bent, blade tips farthest from the body.',
                'Follow-through: arms crossed in front, both daggers pointing out, scarf tails whipping.',
                'Recover: daggers brought back to the low guard, feet together, scarf settling.'],
        cast=['Gather: both daggers raised crossed above the chest, head bowed, scarf lifting.',
              'Daggers spread wide to either side at shoulder height, blades gleaming, knees bent.',
              'Throw wind-up: right arm back over the shoulder holding one dagger up high, left hand open ahead.',
              'Release: right arm snaps forward, dagger tip pointing far ahead at shoulder height, body leaning into the throw.',
              'Recover: arm extended, then lowering, second dagger returned to the left hand, scarf swirling.'],
        back='Back view: hood tip, scarf tails hanging down the back, crossed belts, two dagger hilts at the lower back.'),
    'warlock': dict(
        batch='b02', title='Warlock (hex caller)',
        summary='Robed dark caster in black and magenta with a horned helm and a floating dark orb cupped in one hand.',
        silhouette='Two tall curved horns on a rounded helm, wide bell-shaped robe flaring to the ground, one glowing dark orb held out at hip height.',
        headgear=('horned helm', 'Round black iron helm with a narrow glowing eye-slit and two thick curved bone horns sweeping up and outward.'),
        armour=[('shoulders', 'Round magenta-edged black shoulder plates.', '#64278c'),
                ('chest', 'Black quilted robe front with a magenta sash and a glowing rune clasp.', '#19101d'),
                ('belt', 'Magenta cord belt with three small hanging skull charms.', '#8336b9'),
                ('boots', 'Pointed black boots with magenta toe caps.', '#291c24')],
        cloth='Long black robe hem flaring around the legs with a magenta lining; a short black cape with a magenta inner side hangs from the shoulders.',
        palette=dict(outline='#080706', robe_black='#19101d', robe_mid='#291c24', magenta_dark='#64278c', magenta='#8336b9', magenta_light='#c570e7',
                     glow='#de98f0', horn='#d5c8c7', orb_core='#2f1539', orb_rim='#de98f0', skin='#ecc6a1', boot='#291c24'),
        weapon=('dark orb', 'right', 'A sphere of near-black glass with a bright magenta rim light, floating just above the right palm.', ['#de98f0', '#f4c9fa']),
        carry='the dark orb floating over the right palm, left hand relaxed', cloth_word='the robe hem and cape',
        attack=['Wind-up: right arm pulled back at the hip, orb held close, body coiled, horns tilted down.',
                'Step in with the front foot, right arm swinging forward, orb leading, a lunge forward.',
                'Strike: right arm fully extended ahead at chest height, orb at the far end of the arm, robe snapping.',
                'Follow-through: body leaning far forward, orb at the end of the extended arm, left hand flung back.',
                'Recover: arm drawing back, orb returning above the palm, robe settling.'],
        cast=['Gather: both hands rise to chest height, the orb floating between them, head bowed.',
              'Orb lifts overhead in the right hand, left hand points at the target, knees bending.',
              'Arms spread wide, orb held high above the horns, chest thrust out, robe flaring upward.',
              'Thrust: both arms snap forward, orb at the end of the right arm far ahead of the body.',
              'Recover: arms lowering, orb dropping back over the right palm, cape settling.'],
        back='Back view: two horns from behind, plain helm back with a magenta stripe, cape with a magenta rune on the back, robe hem.'),
    'paladin': dict(
        batch='b02', title='Paladin (shield bearer)',
        summary='Heavy gold and blue plate knight with a huge kite shield on the left arm and a big warhammer in the right hand.',
        silhouette='Broad rounded helm with a small crest, huge shield covering the left half of the body, hammer head bulging over the right shoulder; very wide and short.',
        headgear=('crested great helm', 'Rounded gold-trimmed steel great helm with a T-shaped visor slit and a short blue plume crest.'),
        armour=[('shoulders', 'Large rounded gold pauldrons with blue rivets.', '#d99125'),
                ('chest', 'Silver breastplate with a gold sun emblem over a blue tabard.', '#ccc9cd'),
                ('belt', 'Gold-buckled brown belt holding a blue tabard skirt.', '#a16925'),
                ('shield', 'Huge blue kite shield with a gold rim and a gold sun boss, strapped to the left arm.', '#224e76'),
                ('boots', 'Heavy silver greaves and boots with gold knee caps.', '#938b95')],
        cloth='Short blue tabard with gold trim front and back; a white-and-blue cape fixed at the shoulders hanging to the knees.',
        palette=dict(outline='#080706', gold='#d99125', gold_light='#ffbc3c', gold_dark='#a16925', blue='#224e76', blue_light='#3686a0',
                     blue_pale='#63b6c1', silver='#ccc9cd', silver_dark='#938b95', white='#f4f0e9', skin='#ecc6a1', handle='#80502d'),
        weapon=('warhammer', 'right', 'Big two-faced steel warhammer with a short brown handle and a gold band, held in the right hand; large kite shield on the left arm.', ['#ada9b1', '#80502d']),
        carry='the warhammer resting on the right shoulder or held low, shield on the left arm', cloth_word='the tabard and cape',
        attack=['Wind-up: hammer raised high overhead in the right hand, shield forward to guard, knees bent.',
                'Hammer comes down in a heavy overhead arc, shield arm steadying the body, front foot stepping.',
                'Impact: hammer head slammed down at the far reach in front of the feet, torso bent forward behind the shield.',
                'Follow-through: hammer low and forward at the end of the extended arm, weight on the front foot.',
                'Recover: hammer lifted back to the shoulder, shield raised, feet together.'],
        cast=['Gather: hammer raised in the right hand straight up, shield held in front of the chest, head bowed.',
              'Hammer glows gold, held overhead, shield arm lifts up beside it, knees bending.',
              'Arms spread, hammer high at the right and shield high at the left, chest out, tabard flaring.',
              'Thrust: hammer pointed straight forward at shoulder height, far ahead of the body, shield pulled back.',
              'Recover: hammer lowering to the carry pose, shield dropping, cape settling.'],
        back='Back view: crest and helm back, the cape falling from the shoulders with a gold sun emblem, shield strapped on the left back arm, hammer handle over the right shoulder.'),
    'berserker': dict(
        batch='b03', title='Berserker (axe raider)',
        summary='Wild fur-clad raider in brown leather and bone with a horned helm and two heavy axes.',
        silhouette='Wide bone-horned helm, huge fur collar making the shoulders enormous, one axe in each fist hanging low; very stocky.',
        headgear=('horned helm', 'Open-faced rough iron-brown helm with two thick cream bone horns curving forward, wild hair spilling out the sides.'),
        armour=[('shoulders', 'Huge brown fur mantle over both shoulders with bone studs.', '#80502d'),
                ('chest', 'Bare tanned chest crossed by a brown leather harness with bone buckles.', '#5b371d'),
                ('belt', 'Thick studded belt hung with small bone trophies.', '#342519'),
                ('arms', 'Bone bracers on both forearms.', '#d5a778'),
                ('boots', 'Fur-topped brown boots with leather wraps.', '#5b371d')],
        cloth='Short ragged brown kilt-skirt of leather strips; a tattered fur cloak hangs down the back.',
        palette=dict(outline='#080706', brown_dark='#342519', brown='#5b371d', brown_mid='#80502d', brown_light='#a97747', bone='#d5a778',
                     bone_light='#f4f0e9', skin='#e1bb92', steel='#ada9b1', steel_light='#e4e1e1', blood='#ad181b', hair='#775016'),
        weapon=('double axes', 'both', 'Two heavy single-bladed hand axes with brown handles and dull steel blades, one in each hand, blades pointing outward and down when idle.', ['#ada9b1', '#e4e1e1']),
        carry='an axe hanging in each fist', cloth_word='the fur cloak and kilt strips',
        attack=['Wind-up: both axes pulled back and raised behind the shoulders, chest thrust out, roaring mouth open.',
                'Right axe chops down and across in front of the chest, body twisting, left axe still raised.',
                'Left axe chops across the opposite way, both axes crossed in front, front foot stamped forward.',
                'Spin: body twisting full around, both axes extended outward at the sides, far from the body.',
                'Recover: axes dropping back to the hanging pose, shoulders heaving, fur settling.'],
        cast=['Gather: both axes raised overhead and clashed together, head thrown back in a roar.',
              'Axes held high and apart, chest out, arms trembling, knees bent.',
              'Axes slammed together in front of the chest, body hunched forward.',
              'Throw: right arm snaps forward releasing the axe pose, arm at full reach ahead, left axe pulled back.',
              'Recover: arm lowering, axes back in both hands, breath heaving.'],
        back='Back view: bone horns from behind, wild hair, the ragged fur cloak covering the back, axe handles crossed over the lower back.'),
    'druid': dict(
        batch='b03', title='Druid (grove keeper)',
        summary='Gentle forest keeper in moss-green robes with an antler crown, a leaf cloak and a gnarled wooden staff.',
        silhouette='Wide antler crown above a round hooded head, scalloped leaf cloak making a bell shape, tall staff reaching just above the antlers in the right hand.',
        headgear=('antler crown', 'A round moss-green hood topped with a crown of pale branching antlers and a few small leaves woven between the tines.'),
        armour=[('shoulders', 'Layered overlapping leaf pauldrons.', '#46a43d'),
                ('chest', 'Moss-green tunic with a bark-brown chest strap and a small acorn charm.', '#2f7b31'),
                ('belt', 'Braided vine belt with two hanging herb pouches.', '#80502d'),
                ('boots', 'Wrapped bark-brown boots with moss cuffs.', '#5b371d')],
        cloth='A scalloped cloak made of overlapping green leaves hangs from the shoulders to the knees, with a darker green inner lining.',
        palette=dict(outline='#080706', moss_dark='#183f23', moss='#245a2c', moss_mid='#2f7b31', leaf='#46a43d', leaf_light='#70c14f',
                     leaf_pale='#a5d76b', bark='#5b371d', bark_light='#80502d', antler='#d5a778', antler_dark='#a97747', skin='#e1bb92'),
        weapon=('gnarled staff', 'right', 'A gnarled wooden staff reaching only a little above the antler crown, with a curled top holding a glowing pale green seed-bulb; carried in the right hand.', ['#80502d', '#a5d76b']),
        carry='the staff planted at the right side, left hand relaxed', cloth_word='the leaf cloak',
        attack=['Wind-up: staff pulled back over the right shoulder with both hands, weight on the back foot.',
                'Staff swings forward in a wide horizontal arc at waist height, body turning.',
                'Strike: staff fully extended ahead at the far reach, tip leading, front knee bent.',
                'Follow-through: staff swept past the body to the left, torso twisted, leaf cloak flaring.',
                'Recover: staff returning upright to the right side, feet together, cloak settling.'],
        cast=['Gather: staff lifted straight up in the right hand, left palm open, head bowed, leaves lifting.',
              'Staff raised higher, seed-bulb glowing, antler crown tilted back, arms opening.',
              'Arms spread wide, staff overhead, cloak flared like wings, knees bent.',
              'Thrust: staff pointed forward at shoulder height at full reach, left hand flung open beside it.',
              'Recover: staff lowering to the right side, leaf cloak fluttering down.'],
        back='Back view: antler crown from behind, hood back, the scalloped leaf cloak covering the whole back, staff shaft at the right side.'),
    'necromancer': dict(
        batch='b03', title='Necromancer (bone caller)',
        summary='Gaunt-looking but chunky dark mage in teal robes and bone-white armour, a skull hood, and a long bone staff.',
        silhouette='Large skull-shaped hood, hunched wide shoulders with rib-plate armour, long robe, a tall bone staff topped by a small skull and a pale flame.',
        headgear=('skull hood', 'A teal hood whose front is a white skull mask with dark eye hollows (the face is the skull), a ridge of small bone spikes along the top.'),
        armour=[('shoulders', 'Bone-white shoulder plates shaped like ribs.', '#e4e1e1'),
                ('chest', 'Rib-cage breastplate of bone white over a deep teal robe.', '#f4f0e9'),
                ('belt', 'Teal sash with a small hanging skull and a bone clasp.', '#3686a0'),
                ('boots', 'Dark teal pointed boots with bone toe caps.', '#224e76')],
        cloth='A long deep-teal robe with a tattered hem and a short tattered teal cape with pale teal edges.',
        palette=dict(outline='#080706', teal_dark='#224e76', teal='#3686a0', teal_light='#63b6c1', teal_pale='#b6e8f0', bone='#e4e1e1',
                     bone_white='#f4f0e9', bone_shade='#ccc9cd', night='#19101d', skin='#d5a778'),
        weapon=('bone staff', 'right', 'A long staff made of three lashed bones topped with a small skull that holds a pale teal flame; carried in the right hand.', ['#b6e8f0', '#f4f0e9']),
        carry='the bone staff held upright at the right side, left hand open', cloth_word='the tattered robe hem and cape',
        attack=['Wind-up: staff pulled back horizontally behind the right shoulder, body coiled.',
                'Staff swung forward and down in a diagonal arc, skull tip leading, robe snapping.',
                'Strike: staff thrust forward at full reach, skull tip far ahead of the body, front knee bent.',
                'Follow-through: staff swept low to the left, torso twisted, cape flaring.',
                'Recover: staff drawn back upright at the right side, cape settling.'],
        cast=['Gather: staff raised straight up, left palm opening beside the chest, flame flickering.',
              'Staff held overhead, pale flame growing, skull hood tilted back, arms rising.',
              'Arms spread wide, staff overhead in the right hand, robe flaring, chest out.',
              'Thrust: staff pointed forward at shoulder height at full reach, left hand clawed forward.',
              'Recover: staff lowering upright, flame shrinking, robe settling.'],
        back='Back view: the back of the skull hood (plain teal with a ridge of small bone spikes), rib plates on the back, the tattered cape, staff shaft at the right side.'),
}


def build_hero(cid, c):
    poses = common_poses(c['carry'], c['cloth_word'])
    poses['attack'] = c['attack']
    poses['cast'] = c['cast']
    actions = {}
    for a, (n, fps, loop, refs) in ACTIONS.items():
        entry = dict(frames=n, fps=fps, loop=loop, ref_frames=refs, poses=poses[a])
        if a in ('attack', 'cast'):
            entry['weapon_frames'] = list(range(n))
        actions[a] = entry
    views = json.loads(json.dumps(VIEWS))
    views['up']['descriptor'] += ' ' + c['back']
    wn, hand, wd, hexes = c['weapon']
    return {
        'schema_version': 1, 'id': cid, 'category': 'hero', 'title': c['title'], 'batch': c['batch'],
        'design': {
            'summary': c['summary'], 'silhouette': c['silhouette'],
            'headgear': {'shape': c['headgear'][0], 'description': c['headgear'][1]},
            'armour': [{'part': p, 'description': d, 'color': hx} for p, d, hx in c['armour']],
            'cloth': c['cloth'], 'weapon_summary': wd,
        },
        'palette': c['palette'],
        'proportions': PROPORTIONS,
        'weapon': {'name': wn, 'hand': hand, 'description': wd, 'region_hexes': hexes},
        'views': views,
        'actions': actions,
    }


ENEMY = {
    'schema_version': 1, 'id': 'ember_mite', 'category': 'enemy', 'title': 'Ember Mite (example enemy)', 'batch': 'b99',
    'design': {
        'summary': 'A knee-high round beetle-like critter with a cracked clay shell that glows orange through the cracks.',
        'silhouette': 'Round dome shell, six tiny stubby legs, two short curved pincers and two big round eyes; wider than tall.',
    },
    'palette': {'outline': '#080706', 'shell_dark': '#5b371d', 'shell': '#80502d', 'crack_glow': '#ffbc3c', 'crack_hot': '#fff187',
                'eye': '#f4f0e9', 'pupil': '#080706'},
    'proportions': {'style': 'short wide chibi creature, readable at 64x64 logical pixels', 'standing_height_px': 96, 'cell_px': 256},
    'single': {'subject': 'ember mite enemy, one creature, three-quarter front view', 'pose': 'neutral idle stance, all six legs touching the ground',
               'output_px': 256, 'fill_percent': 70},
}

ITEM = {
    'schema_version': 1, 'id': 'moon_lantern_charm', 'category': 'item', 'title': 'Moon Lantern Charm (example item)', 'batch': 'b99',
    'design': {
        'summary': 'A tiny brass lantern charm on a short chain with a pale blue crescent-moon glass.',
        'silhouette': 'Small rounded lantern body with a ring on top and a crescent glow inside; one object, centred, about 80 percent of the cell.',
    },
    'palette': {'outline': '#080706', 'brass': '#d99125', 'brass_dark': '#a16925', 'glass': '#b6e8f0', 'glow': '#f4f0e9', 'chain': '#938b95'},
    'proportions': {'style': 'flat icon, bold dark outline, 3 flat colours per area', 'standing_height_px': 26, 'cell_px': 32},
    'single': {'subject': 'lantern charm item icon, single object', 'pose': 'upright, hanging by its ring',
               'output_px': 32, 'fill_percent': 80},
}


def main():
    for cid, c in CLASSES.items():
        with open(os.path.join(HERE, cid + '.json'), 'w') as f:
            json.dump(build_hero(cid, c), f, indent=2)
            f.write('\n')
    for name, obj in (('example-enemy.json', ENEMY), ('example-item.json', ITEM)):
        with open(os.path.join(HERE, name), 'w') as f:
            json.dump(obj, f, indent=2)
            f.write('\n')


if __name__ == '__main__':
    main()
