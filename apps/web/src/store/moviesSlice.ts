import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import type { Movie } from "@/types";

interface MoviesState {
  movies: Movie[];
  searchQuery: string;
  selectedCategory: string;
}

const initialState: MoviesState = {
  movies: [],
  searchQuery: '',
  selectedCategory: 'All',
};

export const moviesSlice = createSlice({
  name: 'movies',
  initialState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setSelectedCategory: (state, action: PayloadAction<string>) => {
      state.selectedCategory = action.payload;
    },
  },
});

export const { setSearchQuery, setSelectedCategory } = moviesSlice.actions;

export default moviesSlice.reducer;
