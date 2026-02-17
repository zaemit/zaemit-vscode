import EventEmitter from '../EventEmitter.js';

/**
 * TemplateManager - 상세페이지 템플릿 관리
 * 카테고리별 미리 정의된 섹션 구성을 제공
 */
class TemplateManager extends EventEmitter {
    constructor() {
        super();
        this.templates = this._defineTemplates();
    }

    getTemplates() {
        return this.templates;
    }

    getTemplate(id) {
        return this.templates.find(t => t.id === id) || null;
    }

    getCategories() {
        const categories = new Set(this.templates.map(t => t.category));
        return [...categories];
    }

    /**
     * 템플릿의 섹션 데이터를 반환
     */
    getTemplateSections(templateId) {
        const template = this.getTemplate(templateId);
        if (!template) return [];
        // Deep clone to avoid mutation
        return JSON.parse(JSON.stringify(template.sections));
    }

    _defineTemplates() {
        return [
            // ===== 의류/패션 =====
            {
                id: 'fashion-basic',
                name: '패션 기본형',
                category: '의류/패션',
                description: '깔끔한 상품 이미지 + 상세 설명',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '상품 대표 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'spacer', data: { height: 30 }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h2 style="font-size: 22px; font-weight: 700; color: #222; margin-bottom: 8px;">상품명을 입력하세요</h2><p style="font-size: 28px; font-weight: 700; color: #e74c3c;">₩00,000</p>', fontFamily: "'Pretendard', sans-serif", fontSize: '16px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 20, paddingBottom: 20, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'divider', data: { color: '#eee', thickness: 1, style: 'solid', marginX: 32 }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h3 style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 16px;">상품 상세정보</h3><p style="color: #666; line-height: 2;">이곳에 상품의 상세한 설명을 입력하세요. 소재, 사이즈, 세탁 방법 등 고객이 알아야 할 정보를 작성합니다.</p>', fontFamily: "'Pretendard', sans-serif", fontSize: '15px', color: '#333', textAlign: 'left', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'image', data: { src: '', alt: '상세 이미지 1' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '상세 이미지 2' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'spacer', data: { height: 20 }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                ]
            },
            {
                id: 'fashion-lookbook',
                name: '패션 룩북형',
                category: '의류/패션',
                description: '이미지 중심의 룩북 스타일',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '룩북 메인 이미지' }, style: { backgroundColor: '#f8f8f8', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '룩북 이미지 2' }, style: { backgroundColor: '#f8f8f8', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image-text', data: { src: '', alt: '코디 이미지', caption: '<p style="font-size: 13px; color: #888;">스타일링 팁: 이곳에 코디 설명을 입력하세요</p>', captionFontSize: '13px', captionColor: '#888', captionAlign: 'center' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '디테일 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '디테일 이미지 2' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                ]
            },

            // ===== 식품 =====
            {
                id: 'food-standard',
                name: '식품 표준형',
                category: '식품',
                description: '식품 이미지 + 영양정보 + 상세설명',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '상품 대표 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h2 style="font-size: 24px; font-weight: 700; color: #222; text-align: center;">맛있는 상품명</h2><p style="text-align: center; color: #e67e22; font-size: 20px; font-weight: 600; margin-top: 8px;">₩00,000</p><p style="text-align: center; color: #999; font-size: 13px; margin-top: 4px;">100g / 무료배송</p>', fontFamily: "'Pretendard', sans-serif", fontSize: '16px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'divider', data: { color: '#f0f0f0', thickness: 8, style: 'solid', marginX: 0 }, style: { backgroundColor: '#f0f0f0', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h3 style="font-size: 17px; font-weight: 600; margin-bottom: 12px;">🍽️ 이런 분께 추천해요</h3><ul style="color: #555; line-height: 2.2; list-style: none; padding: 0;"><li>✅ 건강한 간식을 찾는 분</li><li>✅ 온 가족이 함께 즐기고 싶은 분</li><li>✅ 선물용으로 구매하시는 분</li></ul>', fontFamily: "'Pretendard', sans-serif", fontSize: '15px', color: '#333', textAlign: 'left', fontWeight: 'normal' }, style: { backgroundColor: '#fffbf0', paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'image', data: { src: '', alt: '상세 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h3 style="font-size: 17px; font-weight: 600; margin-bottom: 16px;">📋 상품 정보</h3><table style="width: 100%; border-collapse: collapse; font-size: 14px;"><tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0; color: #888; width: 120px;">원산지</td><td style="padding: 10px 0;">국내산</td></tr><tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0; color: #888;">유통기한</td><td style="padding: 10px 0;">제조일로부터 6개월</td></tr><tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0; color: #888;">보관방법</td><td style="padding: 10px 0;">냉장보관 (0~10°C)</td></tr></table>', fontFamily: "'Pretendard', sans-serif", fontSize: '14px', color: '#333', textAlign: 'left', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 } },
                ]
            },

            // ===== 화장품/뷰티 =====
            {
                id: 'beauty-elegant',
                name: '뷰티 엘레강스',
                category: '화장품/뷰티',
                description: '세련된 화장품 상세페이지',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '제품 대표 이미지' }, style: { backgroundColor: '#faf5f0', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<p style="text-align: center; color: #c9a96e; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px;">PREMIUM SKINCARE</p><h2 style="text-align: center; font-size: 26px; font-weight: 300; color: #333; letter-spacing: 1px;">브랜드명 제품 이름</h2><p style="text-align: center; color: #999; font-size: 14px; margin-top: 12px;">피부 깊숙이 수분을 채워주는 프리미엄 케어</p>', fontFamily: "'Pretendard', sans-serif", fontSize: '16px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#faf5f0', paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 } },
                    { type: 'image', data: { src: '', alt: '텍스처 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h3 style="text-align: center; font-size: 18px; font-weight: 400; color: #333; margin-bottom: 20px;">주요 성분</h3><div style="display: flex; justify-content: center; gap: 40px; flex-wrap: wrap;"><div style="text-align: center;"><p style="font-size: 28px; margin-bottom: 4px;">💧</p><p style="font-size: 13px; color: #666;">히알루론산</p></div><div style="text-align: center;"><p style="font-size: 28px; margin-bottom: 4px;">🌿</p><p style="font-size: 13px; color: #666;">녹차 추출물</p></div><div style="text-align: center;"><p style="font-size: 28px; margin-bottom: 4px;">✨</p><p style="font-size: 13px; color: #666;">나이아신아마이드</p></div></div>', fontFamily: "'Pretendard', sans-serif", fontSize: '14px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'image', data: { src: '', alt: '사용법 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '성분 상세 이미지' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                ]
            },

            // ===== 전자기기 =====
            {
                id: 'electronics-spec',
                name: '전자기기 스펙형',
                category: '전자기기',
                description: '스펙 테이블 + 기능 소개',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '제품 대표 이미지' }, style: { backgroundColor: '#0a0a0a', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h2 style="font-size: 28px; font-weight: 700; color: #111; text-align: center;">제품명</h2><p style="text-align: center; color: #666; font-size: 16px; margin-top: 8px;">한 줄로 표현하는 제품의 핵심 가치</p>', fontFamily: "'Pretendard', sans-serif", fontSize: '16px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'text', data: { content: '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; text-align: center;"><div><p style="font-size: 32px; font-weight: 700; color: #2563eb;">12h</p><p style="font-size: 13px; color: #888; margin-top: 4px;">배터리 사용시간</p></div><div><p style="font-size: 32px; font-weight: 700; color: #2563eb;">256GB</p><p style="font-size: 13px; color: #888; margin-top: 4px;">저장 용량</p></div><div><p style="font-size: 32px; font-weight: 700; color: #2563eb;">IP68</p><p style="font-size: 13px; color: #888; margin-top: 4px;">방수 등급</p></div></div>', fontFamily: "'Pretendard', sans-serif", fontSize: '14px', color: '#333', textAlign: 'center', fontWeight: 'normal' }, style: { backgroundColor: '#f7f9fc', paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 32 } },
                    { type: 'image', data: { src: '', alt: '기능 소개 이미지 1' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image-text', data: { src: '', alt: '기능 소개 이미지 2', caption: '<p style="font-size: 14px; color: #555;">기능 설명을 입력하세요</p>', captionFontSize: '14px', captionColor: '#555', captionAlign: 'center' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'text', data: { content: '<h3 style="font-size: 17px; font-weight: 600; margin-bottom: 16px;">📋 제품 사양</h3><table style="width: 100%; border-collapse: collapse; font-size: 14px;"><tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 0; color: #888; width: 140px;">모델명</td><td style="padding: 12px 0;">MODEL-2024</td></tr><tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 0; color: #888;">크기</td><td style="padding: 12px 0;">150 x 72 x 8.5mm</td></tr><tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 0; color: #888;">무게</td><td style="padding: 12px 0;">185g</td></tr><tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 0; color: #888;">색상</td><td style="padding: 12px 0;">블랙 / 화이트 / 블루</td></tr></table>', fontFamily: "'Pretendard', sans-serif", fontSize: '14px', color: '#333', textAlign: 'left', fontWeight: 'normal' }, style: { backgroundColor: '#ffffff', paddingTop: 24, paddingBottom: 24, paddingLeft: 32, paddingRight: 32 } },
                ]
            },

            // ===== 범용 =====
            {
                id: 'simple-image',
                name: '이미지 나열형',
                category: '범용',
                description: '이미지만 쭉 나열하는 심플한 구성',
                thumbnail: null,
                sections: [
                    { type: 'image', data: { src: '', alt: '이미지 1' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '이미지 2' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '이미지 3' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '이미지 4' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                    { type: 'image', data: { src: '', alt: '이미지 5' }, style: { backgroundColor: '#ffffff', paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } },
                ]
            },
            {
                id: 'blank',
                name: '빈 페이지',
                category: '범용',
                description: '빈 캔버스에서 자유롭게 시작',
                thumbnail: null,
                sections: []
            }
        ];
    }
}

export default TemplateManager;
