package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/store"
)

type Category struct {
	ID    int64  `json:"id" validate:"required"`
	Name  string `json:"name" validate:"required"`
	Kind  string `json:"kind" validate:"required"`
	Color string `json:"color" validate:"required"`
	Icon  string `json:"icon" validate:"required"`
}

type CategoryInput struct {
	Name  string `json:"name" validate:"required"`
	Kind  string `json:"kind" validate:"required"`
	Color string `json:"color" validate:"required"`
	Icon  string `json:"icon" validate:"required"`
}

func toCategory(c store.Category) Category {
	return Category{ID: c.ID, Name: c.Name, Kind: c.Kind, Color: c.Color, Icon: c.Icon}
}

func normalizeCategory(in *CategoryInput) error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Color == "" {
		in.Color = "#64748b"
	}
	if in.Icon == "" {
		in.Icon = "tag"
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Name)
	v.Check(n >= 1 && n <= 60, "name", "must be 1-60 characters")
	v.Check(in.Kind == "expense" || in.Kind == "income", "kind", "must be expense or income")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	v.Check(len(in.Icon) <= 40, "icon", "must be at most 40 characters")
	return v.Err()
}

func (s *Service) ListCategories(ctx context.Context, a Actor, kind *string) ([]Category, error) {
	rows, err := s.q.ListCategories(ctx, store.ListCategoriesParams{UserID: a.UserID, Kind: kind})
	if err != nil {
		return nil, err
	}
	out := make([]Category, len(rows))
	for i, r := range rows {
		out[i] = toCategory(r)
	}
	return out, nil
}

func (s *Service) CreateCategory(ctx context.Context, a Actor, in CategoryInput) (Category, error) {
	if err := normalizeCategory(&in); err != nil {
		return Category{}, err
	}
	c, err := s.q.CreateCategory(ctx, store.CreateCategoryParams{UserID: a.UserID, Name: in.Name, Kind: in.Kind, Color: in.Color, Icon: in.Icon})
	if isUnique(err) {
		return Category{}, apperr.Conflict("category_exists", "a category with this name already exists")
	}
	if err != nil {
		return Category{}, err
	}
	return toCategory(c), nil
}

func (s *Service) UpdateCategory(ctx context.Context, a Actor, id int64, in CategoryInput) (Category, error) {
	if err := normalizeCategory(&in); err != nil {
		return Category{}, err
	}
	cur, err := s.q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: a.UserID})
	if err != nil {
		return Category{}, notFound(err)
	}
	if cur.Kind != in.Kind {
		return Category{}, apperr.Validation(map[string]string{"kind": "cannot be changed"})
	}
	c, err := s.q.UpdateCategory(ctx, store.UpdateCategoryParams{ID: id, UserID: a.UserID, Name: in.Name, Color: in.Color, Icon: in.Icon})
	if isUnique(err) {
		return Category{}, apperr.Conflict("category_exists", "a category with this name already exists")
	}
	if err != nil {
		return Category{}, notFound(err)
	}
	return toCategory(c), nil
}

// DeleteCategory removes a category. If it is referenced, reassignTo must name
// another category of the same kind, which inherits every reference.
func (s *Service) DeleteCategory(ctx context.Context, a Actor, id int64, reassignTo *int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		cat, err := q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		if reassignTo != nil {
			if *reassignTo == id {
				return apperr.Validation(map[string]string{"reassign_to": "must be a different category"})
			}
			if err := s.checkCategoryRef(ctx, q, a.UserID, *reassignTo, cat.Kind, "reassign_to"); err != nil {
				return err
			}
			to, from := *reassignTo, id
			if err := q.ReassignExpensesCategory(ctx, store.ReassignExpensesCategoryParams{ToID: to, FromID: from, UserID: a.UserID}); err != nil {
				return err
			}
			if err := q.ReassignFixedCategory(ctx, store.ReassignFixedCategoryParams{ToID: to, FromID: from, UserID: a.UserID}); err != nil {
				return err
			}
			if err := q.ReassignIncomeCategory(ctx, store.ReassignIncomeCategoryParams{ToID: &to, FromID: &from, UserID: a.UserID}); err != nil {
				return err
			}
			if err := q.ReassignEntriesCategory(ctx, store.ReassignEntriesCategoryParams{ToID: &to, FromID: &from, UserID: a.UserID}); err != nil {
				return err
			}
			if err := q.ReassignPlansCategory(ctx, store.ReassignPlansCategoryParams{ToID: to, FromID: from, UserID: a.UserID}); err != nil {
				return err
			}
		} else {
			uses, err := q.CategoryUsage(ctx, store.CategoryUsageParams{ID: id, UserID: a.UserID})
			if err != nil {
				return err
			}
			if uses > 0 {
				return apperr.Conflict("category_in_use", fmt.Sprintf("category is used by %d records; pass reassign_to", uses))
			}
		}
		_, err = q.DeleteCategory(ctx, store.DeleteCategoryParams{ID: id, UserID: a.UserID})
		return err
	})
}
