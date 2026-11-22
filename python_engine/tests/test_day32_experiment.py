"""Day32: local study harness contract; synthetic fixtures are NOT AI outputs."""
from __future__ import annotations
import csv
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'experiments' / 'day32'))
import bench  # noqa: E402
import infer  # noqa: E402


def make_photo(tmp_path: Path, name: str = 'private_subject') -> Path:
    raw = tmp_path / 'raw'
    raw.mkdir(exist_ok=True)
    image = np.zeros((180, 220, 3), dtype=np.uint8)
    image[:,:] = (244, 240, 230)
    image[30:145, 40:190] = (112, 93, 77)
    image[50:80, 55:100] = (245, 245, 245)
    image[100:120, 58:130] = (16, 18, 20)
    Image.fromarray(image).save(raw / (name + '.png'))
    return raw


def create(tmp_path):
    photo = make_photo(tmp_path)
    project = tmp_path / 'private'
    bench.prepare(project, photo, 1024)
    return project


def add_model_output(root: Path, model: str, case: str = 'case_001'):
    src = root / 'sources' / f'{case}.png'
    dest = root / 'outputs' / model / f'{case}.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Synthetic, source-identical fixture; never a claimed neural image.
    with Image.open(src) as im:
        im.save(dest)
    bench.json_write(dest.with_suffix('.json'), {'schema': 'sketchyar-day32-inference-v1',
        'case_id': case, 'engine': model, 'source_sha256': bench.digest_file(src),
        'output_sha256': bench.digest_file(dest), 'runtime_ms': 1.0})
    return dest


def test_prepare_anonymizes_names_and_rejects_overwrite(tmp_path):
    root = create(tmp_path)
    manifest = bench.load_manifest(root)
    assert manifest['cases'][0]['id'] == 'case_001'
    assert (root / 'sources' / 'case_001.png').exists()
    assert not (root / 'sources' / 'private_subject.png').exists()
    assert 'private_subject' not in (root / 'manifest.json').read_text(encoding='utf-8')
    with Image.open(root / 'sources' / 'case_001.png') as im:
        assert im.getexif() == {}
        assert im.mode == 'RGB'
    with pytest.raises(ValueError):
        bench.prepare(root, tmp_path / 'raw', 1024)
    with pytest.raises(ValueError):
        bench.prepare(root, tmp_path / 'raw', 1024, force=True)


def test_pending_never_produces_false_ranking_or_model_claims(tmp_path):
    root = create(tmp_path)
    bench.baseline(root, 'day31_v1')
    bench.report(root)
    report = json.loads((root/'review'/'summary.json').read_text(encoding='utf-8'))
    assert report['ai_outputs_ready'] == 0
    assert report['ai_outputs_required'] == 3
    assert report['ranking'] is None
    assert report['human_review_complete'] is False
    assert (root/'trace'/'day31_v1'/'case_001.png').exists()
    html = (root/'review'/'blind_review.html').read_text(encoding='utf-8')
    assert 'qwen21_turbo' not in html
    assert 'animeganv3' not in html
    assert 'private_subject' not in html
    assert 'A–D' in html


def test_inference_dry_run_does_not_fetch_or_generate(tmp_path, capsys):
    root = create(tmp_path)
    infer.main(['--project', str(root), '--engine', 'qwen21_turbo', '--device', 'cuda', '--dry-run'])
    assert 'PENDING' in capsys.readouterr().out
    assert not (root/'outputs').exists()


def test_provenance_rejects_missing_and_tampered_sidecar(tmp_path):
    root = create(tmp_path)
    image = add_model_output(root, 'qwen21_turbo')
    found = bench.collect(root)
    assert any(r['model']=='qwen21_turbo' and r['status']=='ready' for r in found)
    Image.new('RGB', (100, 100), 'red').save(image)
    with pytest.raises(ValueError, match='changed after generation'):
        bench.collect(root)
    image.unlink()
    found_again = bench.collect(root)
    assert any(r['model'] == 'qwen21_turbo' and r['status'] == 'pending' for r in found_again)


def test_trace_and_report_synthetic_output(tmp_path):
    root = create(tmp_path)
    for name in bench.PROFILES:
        add_model_output(root, name)
        bench.baseline(root, name)
        trace = root/'trace'/name/'case_001.png'
        with Image.open(trace) as im:
            assert im.mode == 'RGBA'
            assert im.size == (220, 180)
    bench.baseline(root, 'day31_v1')
    bench.report(root)
    summary = json.loads((root/'review'/'summary.json').read_text(encoding='utf-8'))
    assert summary['ai_outputs_ready'] == 3
    assert summary['complete_cases'] == 1
    assert summary['ranking'] is None
    assert (root/'review'/'diagnostics.csv').exists()
    assert (root/'review'/'PRIVATE_blind_key.json').exists()


def test_blind_mapping_deterministic_and_ratings_validation(tmp_path):
    root = create(tmp_path)
    bench.report(root)
    mapping = json.loads((root/'review'/'PRIVATE_blind_key.json').read_text(encoding='utf-8'))
    assert sorted(mapping['case_001'].values()) == sorted(bench.ALL_MODELS)
    p = root/'review'/'ratings.csv'
    with p.open('a', newline='') as f:
        writer=csv.writer(f)
        writer.writerow(['case_001','A','r1',5,4,5,4,5])
    scores=bench.score_rows(root,mapping)
    assert sum(s['n_ratings'] for s in scores.values()) == 1
    with p.open('a', newline='') as f:
        writer=csv.writer(f)
        writer.writerow(['case_001','A','r1',5,4,5,4,5])
    with pytest.raises(ValueError, match='Duplicate'):
        bench.score_rows(root,mapping)


def test_image_diagnostics_are_not_an_identity_similarity_claim(tmp_path):
    root = create(tmp_path)
    with Image.open(root/'sources'/'case_001.png') as im:
        m=bench.image_metrics(im)
    assert 0 <= m['edge_density_proxy'] <= 1
    assert 0 <= m['dark_pixel_frac'] <= 1
    assert 'identity_score' not in m
    assert 'manga_quality' not in m


def test_onnx_requires_explicit_weights_without_installing_models(tmp_path):
    root=create(tmp_path)
    with pytest.raises(ValueError, match='onnx-model'):
        infer.main(['--project',str(root),'--engine','animeganv3','--device','cpu'])


def test_rank_only_after_all_models_have_2_full_reviews_each(tmp_path):
    root = create(tmp_path)
    for name in bench.PROFILES:
        add_model_output(root, name)
        bench.baseline(root, name)
    bench.baseline(root, bench.BASELINE)
    bench.report(root)
    ratings = root/'review'/'ratings.csv'
    rows = list(csv.DictReader(ratings.open(newline='', encoding='utf-8')))
    assert len(rows) == 8  # A–D, reviewer_1 and reviewer_2
    for row in rows:
        for k in bench.RUBRIC:
            row[k] = '4'
    with ratings.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    bench.report(root)
    summary = json.loads((root/'review'/'summary.json').read_text(encoding='utf-8'))
    assert summary['human_review_complete'] is True
    assert summary['ranking'] is not None
    assert sorted(summary['ranking']) == sorted(bench.ALL_MODELS)
    # An absent AI output makes the qualitative result incomplete again.
    (root/'outputs'/'animeganv3'/'case_001.png').unlink()
    bench.report(root)
    summary = json.loads((root/'review'/'summary.json').read_text(encoding='utf-8'))
    assert summary['ranking'] is None
